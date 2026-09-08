import { z, ZodError } from 'zod';

import { isoTimestampSchema } from '@/domain/entities';

import { DB_VERSION, STORE_NAMES, openPlannerDb, type StoreName } from './db';
import {
  PersistenceValidationError,
  UnsupportedBackupFormatError,
  formatZodIssues,
} from './errors';
import { withWriteErrorHandling } from './repository';
import { storeSchemas, validateStoreValue, type StoreValue } from './schemaRegistry';

export const BACKUP_FORMAT_VERSION = 1;

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
  const db = await openPlannerDb();

  await withWriteErrorHandling('appSettings', 'restore backup', async () => {
    const transaction = db.transaction(STORE_NAMES, 'readwrite');

    try {
      for (const storeName of STORE_NAMES) {
        await transaction.objectStore(storeName).clear();
      }

      for (const storeName of STORE_NAMES) {
        for (const record of validatedBackup.data[storeName]) {
          await transaction.objectStore(storeName).put(validateStoreValue(storeName, record));
        }
      }

      await transaction.done;
    } catch (error) {
      transaction.abort();
      throw error;
    }
  });
}
