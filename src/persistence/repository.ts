import type { PlannerDB, StoreName } from './db';
import { openPlannerDb } from './db';
import { PersistenceWriteError } from './errors';
import { type StoreValue, validateStoreValue } from './schemaRegistry';
import type { IndexQuery, SqliteClient } from './sqlite/types';

type DbProvider = () => Promise<SqliteClient>;

// SQLite primary result codes (low byte of the extended result code), per
// https://sqlite.org/rescode.html. Errors from either the in-worker sahpool
// driver or the in-memory test driver carry `resultCode` when known.
const SQLITE_BUSY = 5;
const SQLITE_LOCKED = 6;
const SQLITE_FULL = 13;
const SQLITE_CONSTRAINT = 19;

function toPersistenceWriteError(error: unknown, storeName: StoreName, action: string): Error {
  if (error instanceof PersistenceWriteError) {
    return error;
  }

  const resultCode =
    typeof error === 'object' && error !== null && 'resultCode' in error
      ? (error as { resultCode?: number }).resultCode
      : undefined;
  const primaryCode = typeof resultCode === 'number' ? resultCode & 0xff : undefined;

  if (primaryCode === SQLITE_FULL) {
    return new PersistenceWriteError(
      `Unable to ${action} in "${storeName}" because the local storage quota was exceeded.`,
      { cause: error },
    );
  }

  if (primaryCode === SQLITE_CONSTRAINT) {
    return new PersistenceWriteError(
      `Unable to ${action} in "${storeName}" because the write violates a data constraint.`,
      { cause: error },
    );
  }

  if (primaryCode === SQLITE_BUSY || primaryCode === SQLITE_LOCKED) {
    return new PersistenceWriteError(
      `Unable to ${action} in "${storeName}" because the local database is locked (it may be open in another tab or window).`,
      { cause: error },
    );
  }

  if (error instanceof Error) {
    return new PersistenceWriteError(`Unable to ${action} in "${storeName}": ${error.message}`, {
      cause: error,
    });
  }

  return new Error(String(error));
}

export async function withWriteErrorHandling<T>(
  storeName: StoreName,
  action: string,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw toPersistenceWriteError(error, storeName, action);
  }
}

export function createRepository<K extends StoreName>(
  storeName: K,
  getDb: DbProvider = () => openPlannerDb(),
) {
  return {
    async getAll(): Promise<StoreValue<K>[]> {
      const db = await getDb();
      const records = await db.getAll(storeName);
      return records.map((record) => validateStoreValue(storeName, record));
    },

    async getById(id: PlannerDB[K]['key']): Promise<StoreValue<K> | undefined> {
      const db = await getDb();
      const record = await db.getById(storeName, id);
      return record === undefined ? undefined : validateStoreValue(storeName, record);
    },

    async getByIndex(
      indexName: keyof PlannerDB[K]['indexes'] & string,
      query: IndexQuery,
    ): Promise<StoreValue<K>[]> {
      const db = await getDb();
      const records = await db.getByIndex(storeName, indexName, query);
      return records.map((record) => validateStoreValue(storeName, record));
    },

    async put(value: StoreValue<K>): Promise<StoreValue<K>> {
      const validated = validateStoreValue(storeName, value);
      const db = await getDb();

      await withWriteErrorHandling(storeName, 'write data', () => db.put(storeName, validated));
      return validated;
    },

    async delete(id: PlannerDB[K]['key']): Promise<void> {
      const db = await getDb();
      await withWriteErrorHandling(storeName, 'delete data', () => db.delete(storeName, id));
    },

    async clear(): Promise<void> {
      const db = await getDb();
      await withWriteErrorHandling(storeName, 'clear data', () => db.clear(storeName));
    },
  };
}
