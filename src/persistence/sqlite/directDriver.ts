import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import type { Database } from '@sqlite.org/sqlite-wasm';

import { runMigrations } from './migrations';
import * as engine from './engine';
import type { SqliteClient, SqliteWriteOp } from './types';

function applyOp(db: Database, op: SqliteWriteOp): void {
  if (op.op === 'put') {
    engine.upsert(db, op.store, op.value as Record<string, unknown>);
  } else if (op.op === 'delete') {
    engine.remove(db, op.store, op.id);
  } else {
    engine.clearStore(db, op.store);
  }
}

/**
 * In-process SQLite client backed by an in-memory database (no Worker, no
 * OPFS). Used by unit tests, where jsdom cannot reliably host a real dedicated
 * Worker with OPFS SyncAccessHandles. Runs the exact same SQL/engine code as
 * the production Worker client (src/persistence/sqlite/workerClient.ts) —
 * only the transport/persistence backend differs.
 */
export async function createDirectSqliteClient(): Promise<SqliteClient> {
  const sqlite3 = await sqlite3InitModule();
  const db = new sqlite3.oo1.DB(':memory:');
  runMigrations(db);

  return {
    async getAll(storeName) {
      return engine.selectAll(db, storeName);
    },
    async getById(storeName, id) {
      return engine.selectById(db, storeName, id);
    },
    async getByIndex(storeName, indexName, query) {
      return engine.selectByIndex(db, storeName, indexName, query);
    },
    async put(storeName, value) {
      engine.upsert(db, storeName, value as Record<string, unknown>);
    },
    async delete(storeName, id) {
      engine.remove(db, storeName, id);
    },
    async clear(storeName) {
      engine.clearStore(db, storeName);
    },
    async runTransaction(ops) {
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
    },
  };
}
