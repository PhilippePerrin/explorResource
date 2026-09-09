import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppSettings, Company, ImportBatch } from '@/domain/entities';
import {
  DATABASE_NAME,
  DB_VERSION,
  STORE_NAMES,
  deletePlannerDb,
  openPlannerDb,
} from '@/persistence/db';
import { UnsupportedBackupFormatError } from '@/persistence/errors';
import { createRepository } from '@/persistence/repository';
import {
  BACKUP_FORMAT_VERSION,
  exportBackup,
  restoreBackup,
  validateBackup,
} from '@/persistence/backup';

const openTestDb = () => openPlannerDb(DATABASE_NAME);

const appSettingsRepository = createRepository('appSettings', openTestDb);
const companiesRepository = createRepository('companies', openTestDb);
const importBatchesRepository = createRepository('importBatches', openTestDb);

function nowIso(): string {
  return new Date('2026-01-15T10:00:00.000Z').toISOString();
}

function buildAppSettings(): AppSettings {
  return {
    id: 'app-settings',
    displayPrecision: 1,
    visualThresholds: {
      availableBelow: 80,
      usedFrom: 80,
      usedTo: 100,
      overloadFrom: 100,
      overloadTo: 110,
      criticalAbove: 110,
    },
    numericTolerance: 1e-6,
    themePreference: 'system',
    backupFormatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion: DB_VERSION,
  };
}

function buildCompany(): Company {
  const timestamp = nowIso();

  return {
    id: '5f7fd0ce-162a-48cb-b667-e8dc86fbc2af',
    name: 'BioMérieux',
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function buildImportBatch(): ImportBatch {
  const timestamp = nowIso();

  return {
    id: '0d4b2b1d-566f-44ef-b53f-c6bbf9d9e098',
    importedAt: timestamp,
    referenceDate: '2026-01-01',
    fileName: 'capacity-export.xlsx',
    fileSha256: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    rowCount: 42,
    status: 'draft',
    kind: 'demand',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

async function snapshotDatabase() {
  const backup = await exportBackup();
  return JSON.parse(JSON.stringify(backup)) as ReturnType<typeof JSON.parse>;
}

beforeEach(async () => {
  await deletePlannerDb(DATABASE_NAME);
});

describe('IndexedDB schema and persistence', () => {
  it('creates the full object store schema on a fresh database', async () => {
    const db = await openTestDb();
    expect(db.version).toBe(DB_VERSION);
    expect([...db.objectStoreNames]).toEqual([...STORE_NAMES].sort());
  });

  it('round-trips backup export and restore without data loss', async () => {
    await appSettingsRepository.put(buildAppSettings());
    await companiesRepository.put(buildCompany());
    await importBatchesRepository.put(buildImportBatch());

    const exported = await exportBackup();
    await deletePlannerDb(DATABASE_NAME);
    await openTestDb();

    await restoreBackup(exported);

    const restored = await exportBackup();
    expect(restored.data).toEqual(exported.data);
  });

  it('rejects unsupported backup format versions with a clear error', () => {
    expect(() =>
      validateBackup({
        backupFormatVersion: BACKUP_FORMAT_VERSION + 1,
        exportedAt: nowIso(),
        schemaVersion: DB_VERSION,
        data: Object.fromEntries(STORE_NAMES.map((storeName) => [storeName, []])),
      }),
    ).toThrowError(UnsupportedBackupFormatError);
  });

  it('does not partially mutate the database when backup validation fails', async () => {
    await companiesRepository.put(buildCompany());
    const beforeRestore = await snapshotDatabase();

    await expect(
      restoreBackup({
        backupFormatVersion: BACKUP_FORMAT_VERSION,
        exportedAt: nowIso(),
        schemaVersion: DB_VERSION,
        data: {
          ...beforeRestore.data,
          companies: [
            {
              id: 'not-a-uuid',
              name: 'Corrupted Company',
              status: 'active',
              createdAt: nowIso(),
              updatedAt: nowIso(),
            },
          ],
        },
      }),
    ).rejects.toThrowError(/Backup validation failed|Validation failed/i);

    const afterRestore = await exportBackup();
    expect(afterRestore.data).toEqual(beforeRestore.data);
  });

  it('rethrows write failures as PersistenceWriteError', async () => {
    const db = await openTestDb();
    const putSpy = vi
      .spyOn(db, 'put')
      .mockRejectedValueOnce(
        Object.assign(new Error('quota exceeded'), { name: 'QuotaExceededError' }),
      );

    await expect(appSettingsRepository.put(buildAppSettings())).rejects.toMatchObject({
      name: 'PersistenceWriteError',
      message: expect.stringMatching(/quota/i),
    });

    putSpy.mockRestore();
  });
});
