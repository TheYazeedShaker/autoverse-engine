// The narrow slice of PostgREST the repositories use.
//
// Repositories take this interface rather than a concrete Supabase client for one reason: it makes
// brand scoping testable. A fake records the filters a repository applied, so a test can assert
// "this query was scoped to the brand" instead of hoping it was. That is the property worth
// guarding — one missing .eq("brand_id", …) is a cross-tenant read.
//
// Adapting a real @supabase/supabase-js client is a one-liner at the call site: it already has this
// shape. The dependency stays out of this package so the engine can be unit tested without a
// network, a container, or a service-role key sitting in the test environment.

export interface QueryBuilder<Row> {
  /** PostgREST allows .insert(...).select(...) to return the written row. */
  select(columns?: string): QueryBuilder<Row>;
  eq(column: string, value: string | number | boolean): QueryBuilder<Row>;
  in(column: string, values: readonly (string | number)[]): QueryBuilder<Row>;
  order(column: string, opts?: { ascending?: boolean }): QueryBuilder<Row>;
  limit(count: number): QueryBuilder<Row>;
  maybeSingle(): Promise<{ data: Row | null; error: DbError | null }>;
  single(): Promise<{ data: Row | null; error: DbError | null }>;
  then<TResult1 = QueryResult<Row>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<Row>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2>;
}

export interface QueryResult<Row> {
  data: Row[] | null;
  error: DbError | null;
}

export interface DbError {
  message: string;
  code?: string;
}

export interface TableApi<Row> {
  select(columns?: string): QueryBuilder<Row>;
  insert(values: Partial<Row> | Partial<Row>[]): QueryBuilder<Row>;
  update(values: Partial<Row>): QueryBuilder<Row>;
  upsert(values: Partial<Row>, opts?: { onConflict?: string }): QueryBuilder<Row>;
}

export interface EngineDb {
  from<Row>(table: string): TableApi<Row>;
  /** A Postgres function. Used where a write must happen inside the database's own transaction. */
  rpc<T>(
    fn: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: T | null; error: DbError | null }>;
}

/** Thrown instead of returning a null row with an error nobody checked. */
export class EngineDbError extends Error {
  constructor(
    readonly operation: string,
    override readonly cause: DbError,
  ) {
    super(`${operation} failed: ${cause.message}`);
    this.name = "EngineDbError";
  }
}

export function unwrap<T>(operation: string, result: { data: T; error: DbError | null }): T {
  if (result.error) throw new EngineDbError(operation, result.error);
  return result.data;
}
