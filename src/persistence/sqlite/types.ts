import type { StoreName } from './schema';

export type IndexKeyPart = string | number;

/**
 * A single value/composite tuple for equality lookups, or an inclusive
 * lexicographic bound (mirrors IDBKeyRange.bound semantics) for range lookups
 * such as "every month of a given year".
 */
export type IndexQuery =
  IndexKeyPart | IndexKeyPart[] | { from: IndexKeyPart[]; to: IndexKeyPart[] };

export interface SqliteWriteOp {
  store: StoreName;
  op: 'put' | 'delete' | 'clear';
  /** Required for 'put'. Must already be validated by the caller. */
  value?: unknown;
  /** Required for 'delete'. */
  id?: unknown;
}

/**
 * Storage-engine-facing interface shared by the Worker/OPFS client (production)
 * and the in-memory direct driver (tests). Returns are intentionally untyped
 * (`unknown`) at this layer; callers (src/persistence/repository.ts and the
 * few call sites that still talk to the store directly) apply Zod validation
 * or a type assertion to narrow the result, exactly as the previous
 * `idb`-backed layer relied on compile-time-only typing at this boundary.
 */
export interface SqliteClient {
  getAll(storeName: StoreName): Promise<unknown[]>;
  getById(storeName: StoreName, id: unknown): Promise<unknown | undefined>;
  getByIndex(storeName: StoreName, indexName: string, query: IndexQuery): Promise<unknown[]>;
  put(storeName: StoreName, value: unknown): Promise<void>;
  delete(storeName: StoreName, id: unknown): Promise<void>;
  clear(storeName: StoreName): Promise<void>;
  /** Applies every operation atomically (all-or-nothing), in array order. */
  runTransaction(ops: SqliteWriteOp[]): Promise<void>;
}

export class SqliteClientError extends Error {
  /** SQLite extended result code, when known (e.g. 1555 = SQLITE_CONSTRAINT_PRIMARYKEY). */
  public readonly resultCode?: number;

  public constructor(message: string, resultCode?: number) {
    super(message);
    this.name = 'SqliteClientError';
    this.resultCode = resultCode;
  }
}

/** True once the local database could not be opened, most likely because it is
 * already open (and holding its OPFS lock) in another tab or window. */
export class DatabaseUnavailableError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'DatabaseUnavailableError';
  }
}
