import SqliteWorker from '@/workers/sqlite.worker?worker';

import type { StoreName } from './schema';
import { SqliteClientError, type IndexQuery, type SqliteClient, type SqliteWriteOp } from './types';

interface WorkerRequestMessage {
  id: string;
  type: string;
  payload: unknown;
}

interface WorkerResponseMessage {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: { message: string; resultCode?: number };
}

/**
 * Production SqliteClient: proxies every call to the dedicated
 * src/workers/sqlite.worker.ts, which is the only context allowed to hold
 * OPFS SyncAccessHandles. Matches the hand-rolled {id, type, payload}
 * postMessage RPC convention already used by src/import/workerClient.ts.
 */
export function createSqliteWorkerClient(): SqliteClient {
  const worker = new SqliteWorker({ name: 'sqlite-worker' });
  const pending = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();

  worker.onmessage = (event: MessageEvent<WorkerResponseMessage>) => {
    const { id, ok, result, error } = event.data;
    const entry = pending.get(id);

    if (!entry) {
      return;
    }

    pending.delete(id);

    if (ok) {
      entry.resolve(result);
      return;
    }

    entry.reject(
      new SqliteClientError(error?.message ?? 'Unknown SQLite worker error.', error?.resultCode),
    );
  };

  worker.onerror = (event) => {
    for (const entry of pending.values()) {
      entry.reject(new SqliteClientError(event.message || 'SQLite worker failed to load.'));
    }
    pending.clear();
  };

  function call<T>(type: string, payload: unknown): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const id = crypto.randomUUID();
      pending.set(id, { resolve: resolve as (value: unknown) => void, reject });

      const message: WorkerRequestMessage = { id, type, payload };
      worker.postMessage(message);
    });
  }

  return {
    getAll: (storeName: StoreName) => call('getAll', { storeName }),
    getById: (storeName: StoreName, id: unknown) => call('getById', { storeName, id }),
    getByIndex: (storeName: StoreName, indexName: string, query: IndexQuery) =>
      call('getByIndex', { storeName, indexName, query }),
    put: (storeName: StoreName, value: unknown) => call('put', { storeName, value }),
    delete: (storeName: StoreName, id: unknown) => call('delete', { storeName, id }),
    clear: (storeName: StoreName) => call('clear', { storeName }),
    runTransaction: (ops: SqliteWriteOp[]) => call('runTransaction', ops),
  };
}
