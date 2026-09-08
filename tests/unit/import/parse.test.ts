import { describe, expect, it } from 'vitest';

import { analyzeImportWorkbook } from '@/import';

import {
  createExistingImportBatch,
  FIXTURE_RESOURCES,
  FIXTURE_RESOURCE_TYPES,
  readImportFixtureBuffer,
} from './importTestData';

describe('analyzeImportWorkbook', () => {
  it('parses the real workbook fixture, comments and row hierarchy', async () => {
    const analysis = await analyzeImportWorkbook({
      fileName: 'export-philippe.perrin-151251-20260908-101608.xlsx',
      fileSize: 1,
      fileBuffer: readImportFixtureBuffer(),
      resourceTypes: FIXTURE_RESOURCE_TYPES,
      resources: FIXTURE_RESOURCES,
      existingImportBatches: [],
    });

    expect(analysis.fileSha256).toBe(
      '5f5de2bf2fee9ce988ea8fd7056b9f5ea0929d5f126af141e07335e835adb8e9',
    );
    expect(analysis.sheetName.trim()).toBe('DemandWorkload');
    expect(analysis.referenceYear).toBe(2026);
    expect(analysis.ignoredRowNumbers).toHaveLength(34);
    expect(analysis.groups.map((group) => group.code)).toEqual([
      'GIS0006',
      'GIS0010',
      'GIS0022',
      'GIS0097',
      'GIS0112',
      'GIS0114',
      'GIS0120',
      'RUN0001',
      'RUN0040',
    ]);
    expect(analysis.projects).toHaveLength(24);
    expect(analysis.statistics).toMatchObject({
      totalRows: 166,
      groupRows: 9,
      projectRows: 24,
      demandRows: 43,
      supplyRows: 89,
      ambiguousRows: 0,
    });
    expect(analysis.anomalies.filter((anomaly) => anomaly.severity === 'blocking')).toHaveLength(0);

    const firstDemand = analysis.demandSnapshots.find((snapshot) => snapshot.cellRef === 'I5');
    expect(firstDemand).toMatchObject({
      projectCode: 'E0100',
      resourceTypeLabel: 'Commerce - SFDC Developer - EUR',
      demandDays: 0.2,
      supplyDays: 0,
      source: 'comment',
    });

    const normalizedNoise = analysis.demandSnapshots.find((snapshot) => snapshot.cellRef === 'O8');
    expect(normalizedNoise).toMatchObject({
      projectCode: 'E1304',
      demandDays: 2.4,
      supplyDays: 2.4,
      source: 'comment',
    });

    const simulationSupplyRow = analysis.rawRows.find((row) => row.rowNumber === 99);
    expect(simulationSupplyRow?.classification).toBe('supply');
  });

  it('flags SHA-256 duplicates against existing validated import batches', async () => {
    const analysis = await analyzeImportWorkbook({
      fileName: 'export-philippe.perrin-151251-20260908-101608.xlsx',
      fileSize: 1,
      fileBuffer: readImportFixtureBuffer(),
      resourceTypes: FIXTURE_RESOURCE_TYPES,
      resources: FIXTURE_RESOURCES,
      existingImportBatches: [
        createExistingImportBatch({
          fileName: 'already-imported.xlsx',
          fileSha256: '5f5de2bf2fee9ce988ea8fd7056b9f5ea0929d5f126af141e07335e835adb8e9',
        }),
      ],
    });

    expect(analysis.duplicateOf?.fileName).toBe('already-imported.xlsx');
    expect(
      analysis.anomalies.some(
        (anomaly) => anomaly.code === 'duplicate-file' && anomaly.severity === 'blocking',
      ),
    ).toBe(true);
  });

  it('flags unknown resources as blocking anomalies', async () => {
    const analysis = await analyzeImportWorkbook({
      fileName: 'export-philippe.perrin-151251-20260908-101608.xlsx',
      fileSize: 1,
      fileBuffer: readImportFixtureBuffer(),
      resourceTypes: FIXTURE_RESOURCE_TYPES,
      resources: FIXTURE_RESOURCES.filter((resource) => resource.lastName !== 'ELMADI'),
      existingImportBatches: [],
    });

    expect(
      analysis.anomalies.some(
        (anomaly) =>
          anomaly.code === 'unknown-resource' &&
          anomaly.severity === 'blocking' &&
          anomaly.message.includes('Mustapha ELMADI'),
      ),
    ).toBe(true);
  });
});
