import type { Database } from '@sqlite.org/sqlite-wasm';

import { buildSchemaStatements } from './schema';

// This is a fresh schema lineage (SQLite replacing IndexedDB), not a
// continuation of the old `DB_VERSION`/`schemaVersion` numbering — see
// docs/persistence-and-backup.md and BACKUP_FORMAT_VERSION in backup.ts.
// Add future migrations by bumping SCHEMA_VERSION and defining
// migrations[newVersion]; each migration describes how to reach that exact
// version from the prior one, run inside its own transaction.
export const SCHEMA_VERSION = 1;

type Migration = (db: Database) => void;

const migrations: Record<number, Migration> = {
  1: (db) => {
    for (const statement of buildSchemaStatements()) {
      db.exec(statement);
    }
  },
};

function getUserVersion(db: Database): number {
  const rows = db.selectObjects('PRAGMA user_version') as Array<{ user_version: number }>;
  return rows[0]?.user_version ?? 0;
}

function setUserVersion(db: Database, version: number): void {
  // PRAGMA statements don't accept bound parameters; `version` is always one
  // of our own integer constants above, never external input.
  db.exec(`PRAGMA user_version = ${version}`);
}

export function runMigrations(db: Database): void {
  const currentVersion = getUserVersion(db);

  for (let version = currentVersion + 1; version <= SCHEMA_VERSION; version += 1) {
    const migration = migrations[version];

    if (!migration) {
      throw new Error(`Missing SQLite migration for version ${version}.`);
    }

    db.exec('BEGIN');

    try {
      migration(db);
      setUserVersion(db, version);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}
