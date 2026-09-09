import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppSettings, Company, ImportBatch } from '@/domain/entities';
import {
  DB_VERSION,
  STORE_NAMES,
  __setSqliteClientFactoryForTests,
  openPlannerDb,
} from '@/persistence/db';
import { createDirectSqliteClient } from '@/persistence/sqlite/directDriver';
import { UnsupportedBackupFormatError } from '@/persistence/errors';
import { createRepository } from '@/persistence/repository';
import {
  BACKUP_FORMAT_VERSION,
  exportBackup,
  restoreBackup,
  validateBackup,
} from '@/persistence/backup';

const appSettingsRepository = createRepository('appSettings');
const companiesRepository = createRepository('companies');
const importBatchesRepository = createRepository('importBatches');

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

beforeEach(() => {
  // Every test gets a fresh, isolated in-memory SQLite database (no leftover
  // rows or migration state carried over from the previous test).
  __setSqliteClientFactoryForTests(() => createDirectSqliteClient());
});

describe('SQLite schema and persistence', () => {
  it('creates the full table schema on a fresh database, one table per store', async () => {
    const db = await openPlannerDb();
    const tables = (await db.getAll('appSettings')) as unknown[];
    expect(tables).toEqual([]);

    for (const storeName of STORE_NAMES) {
      await expect(db.getAll(storeName)).resolves.toEqual([]);
    }
  });

  it('round-trips backup export and restore without data loss', async () => {
    await appSettingsRepository.put(buildAppSettings());
    await companiesRepository.put(buildCompany());
    await importBatchesRepository.put(buildImportBatch());

    const exported = await exportBackup();
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

  it('does not partially apply a transaction when one write fails midway', async () => {
    await companiesRepository.put(buildCompany());
    const beforeRestore = await snapshotDatabase();
    const db = await openPlannerDb();

    await expect(
      db.runTransaction([
        { store: 'importBatches', op: 'put', value: buildImportBatch() },
        // A second write to the same unique fileSha256 violates the UNIQUE
        // index and must roll back the whole transaction, including the
        // first (otherwise valid) write above.
        { store: 'importBatches', op: 'put', value: { ...buildImportBatch(), id: 'other-id' } },
      ]),
    ).rejects.toThrow();

    const afterRestore = await exportBackup();
    expect(afterRestore.data).toEqual(beforeRestore.data);
  });

  it('rethrows write failures as PersistenceWriteError', async () => {
    const db = await openPlannerDb();
    const putSpy = vi
      .spyOn(db, 'put')
      .mockRejectedValueOnce(
        Object.assign(new Error('database or disk is full'), { resultCode: 13 }),
      );

    await expect(appSettingsRepository.put(buildAppSettings())).rejects.toMatchObject({
      name: 'PersistenceWriteError',
      message: expect.stringMatching(/quota/i),
    });

    putSpy.mockRestore();
  });
});
