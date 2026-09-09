import { z, ZodError } from 'zod';

import { isoTimestampSchema } from '@/domain/entities';

import { DB_VERSION, STORE_NAMES, openPlannerDb, type StoreName } from './db';
import {
  PersistenceValidationError,
  UnsupportedBackupFormatError,
  formatZodIssues,
} from './errors';
import { runTransaction } from './transaction';
import { storeSchemas, validateStoreValue, type StoreValue } from './schemaRegistry';
import type { SqliteWriteOp } from './sqlite/types';

// Bumped from 1 (IndexedDB era) to 2 for the SQLite migration. The JSON
// envelope shape is unchanged, but the two "version 1"s would otherwise
// silently mean different things (IDB schema v1 vs SQLite schema v1, which
// both happen to equal DB_VERSION today) — see docs/persistence-and-backup.md.
export const BACKUP_FORMAT_VERSION = 2;

export type BackupData = Record<StoreName, unknown[]>;

export type BackupFile = {
  backupFormatVersion: number;
  exportedAt: string;
  schemaVersion: number;
  data: BackupData;
};

const backupDataSchemaShape = Object.fromEntries(
  STORE_NAMES.map((storeName) => [storeName, z.array(storeSchemas[storeName])]),
) as unknown as Record<StoreName, z.ZodArray<z.ZodTypeAny>>;

const backupDataSchema = z.object(backupDataSchemaShape);

const backupFileSchema = z
  .object({
    backupFormatVersion: z.number().int().positive(),
    exportedAt: isoTimestampSchema,
    schemaVersion: z.number().int().positive(),
    data: backupDataSchema,
  })
  .strict();

export function validateBackup(json: unknown): BackupFile {
  if (
    typeof json === 'object' &&
    json !== null &&
    'backupFormatVersion' in json &&
    json.backupFormatVersion !== BACKUP_FORMAT_VERSION
  ) {
    throw new UnsupportedBackupFormatError(
      `Unsupported backup format version ${String(
        json.backupFormatVersion,
      )}. Expected ${BACKUP_FORMAT_VERSION}.`,
    );
  }

  try {
    const parsed = backupFileSchema.parse(json) as BackupFile;

    if (parsed.schemaVersion !== DB_VERSION) {
      throw new PersistenceValidationError(
        `Unsupported schema version ${parsed.schemaVersion}. Expected ${DB_VERSION}.`,
      );
    }

    return parsed;
  } catch (error) {
    if (
      error instanceof PersistenceValidationError ||
      error instanceof UnsupportedBackupFormatError
    ) {
      throw error;
    }

    if (error instanceof ZodError) {
      throw new PersistenceValidationError(
        `Backup validation failed: ${formatZodIssues(error.issues)}.`,
        error.issues,
      );
    }

    throw error;
  }
}

async function getValidatedStoreData<K extends StoreName>(
  storeName: K,
  db: Awaited<ReturnType<typeof openPlannerDb>>,
): Promise<StoreValue<K>[]> {
  const records = await db.getAll(storeName);
  return records.map((record) => validateStoreValue(storeName, record));
}

function assignBackupStoreData<K extends StoreName>(
  data: Partial<BackupData>,
  storeName: K,
  records: StoreValue<K>[],
): void {
  (data as BackupData)[storeName] = records;
}

export async function exportBackup(): Promise<BackupFile> {
  const db = await openPlannerDb();
  const data = {} as Partial<BackupData>;

  for (const storeName of STORE_NAMES) {
    assignBackupStoreData(data, storeName, await getValidatedStoreData(storeName, db));
  }

  return {
    backupFormatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    schemaVersion: DB_VERSION,
    data: data as BackupData,
  };
}

export async function restoreBackup(backup: BackupFile): Promise<void> {
  const validatedBackup = validateBackup(backup);

  const ops: SqliteWriteOp[] = STORE_NAMES.flatMap((storeName) => [
    { store: storeName, op: 'clear' },
    ...validatedBackup.data[storeName].map((record): SqliteWriteOp => ({
      store: storeName,
      op: 'put',
      value: validateStoreValue(storeName, record),
    })),
  ]);

  await runTransaction('appSettings', 'restore backup', ops);
}
