import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import type { Database } from '@sqlite.org/sqlite-wasm';

import { runMigrations } from '@/persistence/sqlite/migrations';
import * as engine from '@/persistence/sqlite/engine';
import { OPFS_DATABASE_FILENAME, type StoreName } from '@/persistence/sqlite/schema';
import type { IndexQuery, SqliteWriteOp } from '@/persistence/sqlite/types';

type RequestType =
  'getAll' | 'getById' | 'getByIndex' | 'put' | 'delete' | 'clear' | 'runTransaction';

interface WorkerRequestMessage {
  id: string;
  type: RequestType;
  payload: unknown;
}

interface WorkerSuccessMessage {
  id: string;
  ok: true;
  result: unknown;
}

interface WorkerFailureMessage {
  id: string;
  ok: false;
  error: { message: string; resultCode?: number };
}

let dbPromise: Promise<Database> | null = null;

async function openDatabase(): Promise<Database> {
  const sqlite3 = await sqlite3InitModule();
  // The SyncAccessHandle Pool VFS persists to OPFS without requiring
  // cross-origin isolation (COOP/COEP headers), unlike the default OPFS VFS —
  // decisive since Rebex Tiny Web Server's ability to set custom response
  // headers is unconfirmed. See docs/persistence-and-backup.md.
  const poolUtil = await sqlite3.installOpfsSAHPoolVfs({});
  const db = new poolUtil.OpfsSAHPoolDb(OPFS_DATABASE_FILENAME);
  runMigrations(db);
  return db;
}

function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = openDatabase().catch((error: unknown) => {
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

function applyOp(db: Database, op: SqliteWriteOp): void {
  if (op.op === 'put') {
    engine.upsert(db, op.store, op.value as Record<string, unknown>);
  } else if (op.op === 'delete') {
    engine.remove(db, op.store, op.id);
  } else {
    engine.clearStore(db, op.store);
  }
}

function dispatch(db: Database, type: RequestType, payload: unknown): unknown {
  switch (type) {
    case 'getAll': {
      const { storeName } = payload as { storeName: StoreName };
      return engine.selectAll(db, storeName);
    }
    case 'getById': {
      const { storeName, id } = payload as { storeName: StoreName; id: unknown };
      return engine.selectById(db, storeName, id);
    }
    case 'getByIndex': {
      const { storeName, indexName, query } = payload as {
        storeName: StoreName;
        indexName: string;
        query: IndexQuery;
      };
      return engine.selectByIndex(db, storeName, indexName, query);
    }
    case 'put': {
      const { storeName, value } = payload as { storeName: StoreName; value: unknown };
      engine.upsert(db, storeName, value as Record<string, unknown>);
      return undefined;
    }
    case 'delete': {
      const { storeName, id } = payload as { storeName: StoreName; id: unknown };
      engine.remove(db, storeName, id);
      return undefined;
    }
    case 'clear': {
      const { storeName } = payload as { storeName: StoreName };
      engine.clearStore(db, storeName);
      return undefined;
    }
    case 'runTransaction': {
      const ops = payload as SqliteWriteOp[];
      db.exec('BEGIN');
      try {
        for (const op of ops) {
          applyOp(db, op);
        }
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      return undefined;
    }
    default:
      throw new Error(`Unknown SQLite worker request type: ${String(type)}.`);
  }
}

self.onmessage = async (event: MessageEvent<WorkerRequestMessage>) => {
  const { id, type, payload } = event.data;

  try {
    const db = await getDb();
    const result = dispatch(db, type, payload);
    const response: WorkerSuccessMessage = { id, ok: true, result };
    self.postMessage(response);
  } catch (error) {
    const response: WorkerFailureMessage = {
      id,
      ok: false,
      error: {
        message: error instanceof Error ? error.message : 'Unknown SQLite worker error.',
        resultCode:
          typeof error === 'object' && error !== null && 'resultCode' in error
            ? (error as { resultCode?: number }).resultCode
            : undefined,
      },
    };
    self.postMessage(response);
  }
};
