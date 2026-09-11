import { beforeEach, describe, expect, it } from 'vitest';

import type { ImportBatch, ResourceNonWorkingDays } from '@/domain/entities';
import { deletePlannerDb } from '@/persistence/db';
import { createRepository } from '@/persistence/repository';
import { analyzeTeamCalendarWorkbook } from '@/teamCalendarImport/parse';
import { commitTeamCalendarAnalysis } from '@/teamCalendarImport/commit';

import { buildFixtureResources, readTeamCalendarFixtureBuffer } from './teamCalendarTestData';

const nonWorkingDaysRepository = createRepository('resourceNonWorkingDays');
const importBatchesRepository = createRepository('importBatches');

describe('commitTeamCalendarAnalysis', () => {
  beforeEach(async () => {
    await deletePlannerDb();
  });

  it('writes one resourceNonWorkingDays row per staged resource/month total', async () => {
    const buffer = readTeamCalendarFixtureBuffer();
    const resources = buildFixtureResources();
    const analysis = await analyzeTeamCalendarWorkbook({
      fileName: 'Team Calendar.xlsx',
      fileSize: buffer.byteLength,
      fileBuffer: buffer,
      resources,
      existingImportBatches: [],
    });

    const result = await commitTeamCalendarAnalysis({ analysis, note: 'Initial import' });

    expect(result.importBatch.kind).toBe('non-working-days');
    expect(result.importBatch.status).toBe('validated');
    expect(result.upsertedMonths).toBe(analysis.monthlyTotals.length);

    const entries = (await nonWorkingDaysRepository.getAll()) as ResourceNonWorkingDays[];
    expect(entries).toHaveLength(analysis.monthlyTotals.length);

    const david = resources.find((r) => r.lastName === 'CARRASCO');
    const davidAugust = entries.find(
      (entry) => entry.resourceId === david?.id && entry.year === 2025 && entry.month === 8,
    );
    expect(davidAugust?.days).toBeGreaterThan(10);
  });

  it('replaces an existing month value rather than adding to it', async () => {
    const buffer = readTeamCalendarFixtureBuffer();
    const resources = buildFixtureResources();
    const david = resources.find((r) => r.lastName === 'CARRASCO');
    if (!david) {
      throw new Error('fixture resource missing');
    }

    await nonWorkingDaysRepository.put({
      id: 'aaaaaaaa-0000-4000-8000-000000000001',
      resourceId: david.id,
      year: 2025,
      month: 8,
      days: 3,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const analysis = await analyzeTeamCalendarWorkbook({
      fileName: 'Team Calendar.xlsx',
      fileSize: buffer.byteLength,
      fileBuffer: buffer,
      resources,
      existingImportBatches: [],
    });

    // Pick a year/month the file genuinely has no signal for, to prove an
    // untouched cell survives the import unchanged (not zeroed, not summed).
    const davidTouchedMonths = new Set(
      analysis.monthlyTotals
        .filter((total) => total.resourceId === david.id)
        .map((total) => `${total.year}-${total.month}`),
    );
    const candidateMonths = Array.from({ length: 12 }, (_, index) => ({
      year: 2025,
      month: index + 1,
    })).concat(Array.from({ length: 12 }, (_, index) => ({ year: 2027, month: index + 1 })));
    const untouchedMonth = candidateMonths.find(
      (candidate) => !davidTouchedMonths.has(`${candidate.year}-${candidate.month}`),
    );
    if (!untouchedMonth) {
      throw new Error('Expected at least one untouched month for the fixture data.');
    }

    await nonWorkingDaysRepository.put({
      id: 'aaaaaaaa-0000-4000-8000-000000000002',
      resourceId: david.id,
      year: untouchedMonth.year,
      month: untouchedMonth.month,
      days: 4,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    await commitTeamCalendarAnalysis({ analysis });

    const entries = (await nonWorkingDaysRepository.getAll()) as ResourceNonWorkingDays[];
    const davidAugust = entries.find(
      (entry) => entry.resourceId === david.id && entry.year === 2025 && entry.month === 8,
    );
    const davidUntouched = entries.find(
      (entry) =>
        entry.resourceId === david.id &&
        entry.year === untouchedMonth.year &&
        entry.month === untouchedMonth.month,
    );

    const expectedAugustTotal = analysis.monthlyTotals.find(
      (total) => total.resourceId === david.id && total.year === 2025 && total.month === 8,
    )?.days;

    // Replaced, not summed with the pre-existing manual value of 3.
    expect(davidAugust?.days).toBe(expectedAugustTotal);
    expect(davidAugust?.days).not.toBe(3);
    // A month the file has no signal for is left exactly as it was.
    expect(davidUntouched?.days).toBe(4);
  });

  it('commits successfully when every resource is unmatched, writing nothing for them', async () => {
    const buffer = readTeamCalendarFixtureBuffer();
    const analysis = await analyzeTeamCalendarWorkbook({
      fileName: 'Team Calendar.xlsx',
      fileSize: buffer.byteLength,
      fileBuffer: buffer,
      resources: [],
      existingImportBatches: [],
    });

    const unknownResourceAnomalies = analysis.anomalies.filter(
      (anomaly) => anomaly.code === 'unknown-resource',
    );
    expect(unknownResourceAnomalies.length).toBeGreaterThan(0);
    expect(unknownResourceAnomalies.every((anomaly) => anomaly.severity === 'warning')).toBe(
      true,
    );

    const result = await commitTeamCalendarAnalysis({ analysis });
    expect(result.upsertedMonths).toBe(0);

    const entries = await nonWorkingDaysRepository.getAll();
    expect(entries).toHaveLength(0);

    const batches = await importBatchesRepository.getAll();
    expect(batches).toHaveLength(1);
  });

  it('blocks a second commit of the identical file as a duplicate', async () => {
    const buffer = readTeamCalendarFixtureBuffer();
    const resources = buildFixtureResources();
    const firstAnalysis = await analyzeTeamCalendarWorkbook({
      fileName: 'Team Calendar.xlsx',
      fileSize: buffer.byteLength,
      fileBuffer: buffer,
      resources,
      existingImportBatches: [],
    });
    await commitTeamCalendarAnalysis({ analysis: firstAnalysis });

    const batches = (await importBatchesRepository.getAll()) as ImportBatch[];
    const secondAnalysis = await analyzeTeamCalendarWorkbook({
      fileName: 'Team Calendar.xlsx',
      fileSize: buffer.byteLength,
      fileBuffer: buffer,
      resources,
      existingImportBatches: batches,
    });

    expect(secondAnalysis.duplicateOf).toBeDefined();
    await expect(commitTeamCalendarAnalysis({ analysis: secondAnalysis })).rejects.toThrow(
      /already been imported/i,
    );
  });
});
