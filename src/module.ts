import { mkdir } from 'node:fs/promises'
import { createStorage } from 'unstorage'
import { defineNuxtModule, createResolver, resolvePath, addTemplate, addTypeTemplate, resolveAlias, addImports, addServerImports, addServerHandler } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'
import { deflate } from 'pako'
import { hash } from 'ohash'
import { join } from 'pathe'
import { chunks, getMountDriver, generateStorageMountOptions } from './utils/source'
import type { MountOptions } from './types/source'
import { resolveCollections, generateCollectionInsert } from './utils/collection'
import { collectionsTemplate, contentTypesTemplate } from './utils/templates'
import type { ResolvedCollection } from './types/collection'
import type { ModuleOptions } from './types/module'
import { watchContents } from './utils/dev'
import { parseContent } from './utils/content'

export * from './utils/collection'
export * from './utils/schema'
export type * from './types'

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'Content',
    configKey: 'contentV3',
  },
  defaults: {
    database: 'builtin',
    dev: {
      dataDir: '.data/content',
      databaseName: 'items.db',
    },
  },
  async setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)

    options.dev!.dataDir = join(nuxt.options.rootDir, options.dev!.dataDir!)
    await mkdir(options.dev!.dataDir, { recursive: true }).catch(() => {})

    const configPath = await resolvePath(join(nuxt.options.rootDir, 'content.config'), { extensions: ['mjs', 'js', 'ts'] })
    const contentConfig = configPath
      ? await import(configPath)
        .catch((err) => {
          console.error(err)
          return []
        })
      : {}

    const collections = resolveCollections(contentConfig.collections || [])
    const integrityVersion = '0.0.1-' + hash(collections.map(c => c.table).join('-'))

    const publicRuntimeConfig = {
      integrityVersion,
    }

    const privateRuntimeConfig = {
      integrityVersion,
      dev: options.dev,
      db: options.database,
    }
    nuxt.options.runtimeConfig.public.contentv3 = publicRuntimeConfig
    nuxt.options.runtimeConfig.contentv3 = privateRuntimeConfig

    nuxt.options.vite.optimizeDeps = nuxt.options.vite.optimizeDeps || {}
    nuxt.options.vite.optimizeDeps.exclude = nuxt.options.vite.optimizeDeps.exclude || []
    nuxt.options.vite.optimizeDeps.exclude.push('@sqlite.org/sqlite-wasm')

    nuxt.options.routeRules ||= {}
    nuxt.options.routeRules['/api/database'] = { prerender: true }

    addServerHandler({ route: '/api/database', handler: resolver.resolve('./runtime/server/api/database') })
    addServerHandler({ handler: resolver.resolve('./runtime/server/middleware/coop'), middleware: true })

    addImports([
      { name: 'queryCollection', from: resolver.resolve('./runtime/utils/queryCollection') },
      { name: 'getCollectionNavigation', from: resolver.resolve('./runtime/utils/getCollectionNavigation') },
      { name: 'getSurroundingCollectionItems', from: resolver.resolve('./runtime/utils/getSurroundingCollectionItems') },
      { name: 'queryContentV3', from: resolver.resolve('./runtime/composables/queryContentV3') },
    ])

    addServerImports([
      { name: 'queryCollection', from: resolver.resolve('./runtime/utils/queryCollection') },
      { name: 'getCollectionNavigation', from: resolver.resolve('./runtime/utils/getCollectionNavigation') },
      { name: 'getSurroundingCollectionItems', from: resolver.resolve('./runtime/utils/getCollectionNavigation') },
    ])

    addServerHandler({ route: '/api/:collection/query', handler: resolver.resolve('./runtime/server/api/[collection]/query.post'), method: 'post' })

    // Types template
    addTypeTemplate({ filename: 'content/content.d.ts', getContents: contentTypesTemplate, options: { collections } })

    nuxt.options.nitro.alias = nuxt.options.nitro.alias || {}
    nuxt.options.nitro.alias['#content-v3/collections'] = addTemplate({
      filename: 'content/collections.mjs',
      getContents: collectionsTemplate,
      options: { collections },
      write: true,
    }).dst

    let sqlDump: string[] = []
    nuxt.options.nitro.alias['#content-v3/dump'] = addTemplate({ filename: 'content/dump.mjs', getContents: () => {
      const compressed = deflate(JSON.stringify(sqlDump))

      const str = Buffer.from(compressed.buffer).toString('base64')
      return `export default "${str}"`
    }, write: true }).dst

    if (nuxt.options._prepare) {
      return
    }

    const storage = await createCollectionsStorage(nuxt, collections)
    const dumpGeneratePromise = generateSqlDump(storage, collections, privateRuntimeConfig.integrityVersion)
      .then((dump) => {
        sqlDump = dump
      })

    nuxt.hook('app:templates', async () => {
      await dumpGeneratePromise
    })

    if (nuxt.options.dev) {
      const databaseLocation = join(options.dev!.dataDir, options.dev!.databaseName!)
      watchContents(nuxt, storage, collections, databaseLocation)
    }
  },
})

async function createCollectionsStorage(nuxt: Nuxt, collections: ResolvedCollection[]) {
  const storage = createStorage()
  const sources = collections
    .filter(c => !!c.source)
    .map(col => ({ name: col.name, ...col.source })) as Array<MountOptions>

  const mountsOptions = generateStorageMountOptions(nuxt, sources)

  for (const [key, options] of Object.entries(mountsOptions)) {
    if (options.driver === 'fs' && options.base) {
      options.base = resolveAlias(options.base)
    }
    storage.mount(key, await getMountDriver(options))
  }
  return storage
}

async function generateSqlDump(storage: ReturnType<typeof createStorage>, collections: ResolvedCollection[], integrityVersion: string) {
  const sqlDumpList: string[] = []

  // Create database dump
  for await (const collection of collections) {
    // Collection table definition
    sqlDumpList.push(collection.table)

    // Insert content
    const keys = await storage.getKeys(collection.name)
    for await (const chunk of chunks(keys, 25)) {
      await Promise.all(chunk.map(async (key) => {
        console.log('Processing', key)
        const parsedContent = await parseContent(storage, collection, key)

        sqlDumpList.push(generateCollectionInsert(collection, parsedContent))
      }))
    }
  }

  const infoCollection = collections.find(c => c.name === '_info')!
  sqlDumpList.push(generateCollectionInsert(infoCollection, { id: 'version', version: integrityVersion }))

  return sqlDumpList
}
