import type { ZodObject, ZodRawShape } from 'zod'
import type { JsonSchema7Type } from 'zod-to-json-schema'
import type { Nuxt } from '@nuxt/schema'
import type { MarkdownRoot } from './content'

export interface PageCollections {}
export interface Collections {}

export type CollectionType = 'page' | 'data'

export type CollectionSource = {
  repository?: string
  cwd?: string
  path: string
  prefix?: string
  ignore?: string[]
}

export interface ResolvedCollectionSource extends CollectionSource {
  prepare?: (nuxt: Nuxt) => Promise<void>
  cwd: string
}

export interface PageCollection<T extends ZodRawShape = ZodRawShape> {
  type: 'page'
  source?: string | CollectionSource
  schema?: ZodObject<T>
}

export interface DataCollection<T extends ZodRawShape = ZodRawShape> {
  type: 'data'
  source?: string | CollectionSource
  schema: ZodObject<T>
}

export type Collection<T extends ZodRawShape = ZodRawShape> = PageCollection<T> | DataCollection<T>

export interface DefinedCollection<T extends ZodRawShape = ZodRawShape> {
  type: CollectionType
  source: CollectionSource | string | undefined
  schema: ZodObject<T>
  extendedSchema: ZodObject<T>
}

export interface ResolvedCollection<T extends ZodRawShape = ZodRawShape> {
  name: string
  pascalName: string
  type: CollectionType
  source: ResolvedCollectionSource | undefined
  schema: ZodObject<T>
  extendedSchema: ZodObject<T>
  tableName: string
  tableDefinition: string
  generatedFields: {
    raw: boolean
    body: boolean
    path: boolean
  }
  jsonFields: string[]
}

export interface CollectionInfo {
  name: string
  pascalName: string
  tableName: string
  source: CollectionSource | undefined
  type: CollectionType
  schema: JsonSchema7Type
  jsonFields: string[]
}

export interface CollectionItemBase {
  contentId: string
  stem: string
  extension: string
  meta: Record<string, unknown>
}

export interface PageCollectionItemBase extends CollectionItemBase {
  path: string
  title: string
  description: string
  seo?: {
    title: string
    description: string

    [key: string]: unknown
  }
  body: MarkdownRoot
  navigation?: boolean | {
    title: string
    description: string
    icon: string
  }
}

export interface DataCollectionItemBase extends CollectionItemBase {}