export interface DatabaseAdapter {
  first<T>(sql: string, params?: Array<number | string | boolean>): Promise<T | null | undefined>
  all<T>(sql: string, params?: Array<number | string | boolean>): Promise<T[]>
  exec(sql: string): Promise<void>
}
type databaseAdapter<Options> = (otps?: Options) => Promise<DatabaseAdapter> | DatabaseAdapter

export function createDatabaseAdapter<Options = unknown>(adapter: databaseAdapter<Options>) {
  return adapter
}