import type { IDBPDatabase } from 'idb';

import type { PlannerDB, StoreName } from './db';
import { openPlannerDb } from './db';
import { PersistenceWriteError } from './errors';
import { type StoreValue, validateStoreValue } from './schemaRegistry';

type DbProvider = () => Promise<IDBPDatabase<PlannerDB>>;

function toPersistenceWriteError(error: unknown, storeName: StoreName, action: string): Error {
  if (error instanceof PersistenceWriteError) {
    return error;
  }

  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    if (error.name === 'QuotaExceededError') {
      return new PersistenceWriteError(
        `Unable to ${action} in "${storeName}" because the browser storage quota was exceeded.`,
        { cause: error },
      );
    }

    return new PersistenceWriteError(
      `Unable to ${action} in "${storeName}" because IndexedDB rejected the write operation (${error.name}).`,
      { cause: error },
    );
  }

  if (error instanceof Error) {
    if (error.name === 'QuotaExceededError') {
      return new PersistenceWriteError(
        `Unable to ${action} in "${storeName}" because the browser storage quota was exceeded.`,
        { cause: error },
      );
    }

    if (error.name === 'AbortError' || error.name === 'InvalidStateError') {
      return new PersistenceWriteError(
        `Unable to ${action} in "${storeName}" because the IndexedDB transaction failed.`,
        { cause: error },
      );
    }

    if (error.name === 'DataError' || error.name === 'ConstraintError') {
      return new PersistenceWriteError(
        `Unable to ${action} in "${storeName}" because IndexedDB rejected the write request.`,
        { cause: error },
      );
    }
  }

  return error instanceof Error ? error : new Error(String(error));
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
      const record = await db.get(storeName, id);
      return record === undefined ? undefined : validateStoreValue(storeName, record);
    },

    async getByIndex(indexName: keyof PlannerDB[K]['indexes'], query: IDBValidKey | IDBKeyRange) {
      const db = await getDb();
      const transaction = db.transaction(storeName, 'readonly');
      const records = await transaction
        .objectStore(storeName)
        .index(indexName as keyof PlannerDB[K]['indexes'] & string)
        .getAll(query as never);
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
