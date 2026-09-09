import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';

import { analyzeResourceImportWorkbook } from '@/resourceImport/parse';
import type { Resource, ResourceType } from '@/domain/entities';

import { readResourceImportFixtureBuffer } from './resourceImportTestData';

function buildResourceWorkbookBuffer(rows: (string | number | null)[][]): ArrayBuffer {
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Availability list');
  const output = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return output;
}

const HEADER_ROW = ['Resource', 'Quantity', 'Percentage', 'Start date', 'Finish date', 'File'];

const RESOURCE_TYPE_A: ResourceType = {
  id: '2b973647-498d-4c42-8d90-71f668f30c2e',
  label: 'Commerce - SFDC Developer - EUR',
  color: '#00427f',
  status: 'active',
  displayOrder: 1,
  createdAt: '2026-09-08T10:00:00.000Z',
  updatedAt: '2026-09-08T10:00:00.000Z',
};

const RESOURCE_TYPE_B: ResourceType = {
  id: 'aaeb95ec-c04d-4c1d-9c85-b8d633258c2f',
  label: 'Commerce - SFDC Technical Analyst - EUR',
  color: '#00856a',
  status: 'active',
  displayOrder: 2,
  createdAt: '2026-09-08T10:00:00.000Z',
  updatedAt: '2026-09-08T10:00:00.000Z',
};

function buildExistingResource(overrides: Partial<Resource> = {}): Resource {
  return {
    id: '1d81d9fd-f2c4-4e42-8247-c8dcf5906d82',
    firstName: 'Zakaria',
    lastName: 'IDER',
    resourceTypeId: RESOURCE_TYPE_A.id,
    collaborationType: 'internal',
    status: 'active',
    createdAt: '2026-09-08T10:00:00.000Z',
    updatedAt: '2026-09-08T10:00:00.000Z',
    ...overrides,
  };
}

describe('analyzeResourceImportWorkbook (real fixture)', () => {
  it('parses the real Availability list export cleanly with no prior resources', async () => {
    const buffer = readResourceImportFixtureBuffer();
    const analysis = await analyzeResourceImportWorkbook({
      fileName: 'export-resource.xlsx',
      fileSize: buffer.byteLength,
      fileBuffer: buffer,
      resourceTypes: [],
      resources: [],
      existingImportBatches: [],
    });

    expect(analysis.sheetName.trim()).toBe('Availability list');
    expect(analysis.anomalies).toHaveLength(0);
    expect(analysis.resourceTypesToCreate.map((type) => type.label).sort()).toEqual(
      [
        'Commerce - SFDC Developer - EUR',
        'Commerce - SFDC Release & Platform - EUR',
        'Commerce - SFDC Technical Analyst - EUR',
      ].sort(),
    );
    expect(analysis.resources).toHaveLength(23);
    expect(analysis.resources.every((resource) => resource.action === 'create')).toBe(true);
    expect(analysis.statistics.skippedInactiveCount).toBe(1);

    const byName = new Map(
      analysis.resources.map((resource) => [
        `${resource.firstName} ${resource.lastName}`,
        resource,
      ]),
    );

    // "Hassan ALAMI" appears twice in the file: once under the active type, once
    // under "[Inactive Res.] ..." for an ended assignment. Only the active one counts.
    expect(byName.get('Hassan ALAMI')?.resourceTypeLabel).toBe(
      'Commerce - SFDC Release & Platform - EUR',
    );
    // These two are listed *after* the inactive marker in the file — regression
    // coverage for the one-shot "[Inactive Res.]" reversion.
    expect(byName.get('Laura PICHON')?.resourceTypeLabel).toBe(
      'Commerce - SFDC Release & Platform - EUR',
    );
    expect(byName.get('Zakaria IDER')?.resourceTypeLabel).toBe(
      'Commerce - SFDC Release & Platform - EUR',
    );
  });

  it('reports resources whose type differs as updates and matches on exact name', async () => {
    const buffer = readResourceImportFixtureBuffer();
    const existingResource = buildExistingResource({ resourceTypeId: RESOURCE_TYPE_B.id });
    const analysis = await analyzeResourceImportWorkbook({
      fileName: 'export-resource.xlsx',
      fileSize: buffer.byteLength,
      fileBuffer: buffer,
      resourceTypes: [RESOURCE_TYPE_B],
      resources: [existingResource],
      existingImportBatches: [],
    });

    const zakaria = analysis.resources.find(
      (resource) => resource.firstName === 'Zakaria' && resource.lastName === 'IDER',
    );

    expect(zakaria?.action).toBe('update');
    expect(zakaria?.matchedResourceId).toBe(existingResource.id);
    expect(zakaria?.previousResourceTypeLabel).toBe(RESOURCE_TYPE_B.label);
    expect(analysis.noLongerListed).toHaveLength(0);
  });

  it('leaves a matching resource unchanged when its type already matches', async () => {
    const buffer = readResourceImportFixtureBuffer();
    const existingResource = buildExistingResource({
      resourceTypeId: '068dcff2-c8da-473d-bbba-e77daa0a61c4',
    });
    const resourceType: ResourceType = {
      id: '068dcff2-c8da-473d-bbba-e77daa0a61c4',
      label: 'Commerce - SFDC Release & Platform - EUR',
      color: '#7f4b00',
      status: 'active',
      displayOrder: 3,
      createdAt: '2026-09-08T10:00:00.000Z',
      updatedAt: '2026-09-08T10:00:00.000Z',
    };

    const analysis = await analyzeResourceImportWorkbook({
      fileName: 'export-resource.xlsx',
      fileSize: buffer.byteLength,
      fileBuffer: buffer,
      resourceTypes: [resourceType],
      resources: [existingResource],
      existingImportBatches: [],
    });

    const zakaria = analysis.resources.find(
      (resource) => resource.firstName === 'Zakaria' && resource.lastName === 'IDER',
    );

    expect(zakaria?.action).toBe('unchanged');
  });

  it('lists an existing active resource absent from the file as no longer listed', async () => {
    const buffer = readResourceImportFixtureBuffer();
    const departedResource = buildExistingResource({
      id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      firstName: 'Someone',
      lastName: 'GONE',
    });

    const analysis = await analyzeResourceImportWorkbook({
      fileName: 'export-resource.xlsx',
      fileSize: buffer.byteLength,
      fileBuffer: buffer,
      resourceTypes: [],
      resources: [departedResource],
      existingImportBatches: [],
    });

    expect(analysis.noLongerListed).toEqual([
      { id: departedResource.id, firstName: 'Someone', lastName: 'GONE' },
    ]);
  });

  it('flags a duplicate file as a blocking anomaly', async () => {
    const buffer = readResourceImportFixtureBuffer();
    const preliminary = await analyzeResourceImportWorkbook({
      fileName: 'export-resource.xlsx',
      fileSize: buffer.byteLength,
      fileBuffer: buffer,
      resourceTypes: [],
      resources: [],
      existingImportBatches: [],
    });

    const analysis = await analyzeResourceImportWorkbook({
      fileName: 'export-resource.xlsx',
      fileSize: buffer.byteLength,
      fileBuffer: buffer,
      resourceTypes: [],
      resources: [],
      existingImportBatches: [
        {
          id: 'batch-1',
          fileName: 'previous-resource-import.xlsx',
          fileSha256: preliminary.fileSha256,
          importedAt: '2026-09-07T09:00:00.000Z',
          referenceDate: '2026-09-07',
          status: 'validated',
        },
      ],
    });

    expect(analysis.duplicateOf?.fileName).toBe('previous-resource-import.xlsx');
    expect(analysis.anomalies.some((anomaly) => anomaly.code === 'duplicate-file')).toBe(true);
    expect(analysis.anomalies.find((anomaly) => anomaly.code === 'duplicate-file')?.severity).toBe(
      'blocking',
    );
  });
});

describe('analyzeResourceImportWorkbook (synthetic edge cases)', () => {
  it('flags a detail row with no preceding resource-type header as an orphan', async () => {
    const buffer = buildResourceWorkbookBuffer([
      [null, null, null, null, null, null],
      HEADER_ROW,
      ['Commerce - SFDC Developer - EUR/Some.One', 1, 100, null, null, 'DATASET'],
    ]);

    const analysis = await analyzeResourceImportWorkbook({
      fileName: 'synthetic.xlsx',
      fileSize: buffer.byteLength,
      fileBuffer: buffer,
      resourceTypes: [],
      resources: [],
      existingImportBatches: [],
    });

    expect(analysis.anomalies).toHaveLength(1);
    expect(analysis.anomalies[0]?.code).toBe('orphan-detail-row');
    expect(analysis.resources).toHaveLength(0);
  });

  it('flags a person row with no following detail row', async () => {
    const buffer = buildResourceWorkbookBuffer([
      [null, null, null, null, null, null],
      HEADER_ROW,
      ['Commerce - SFDC Developer - EUR', null, null, null, null, null],
      ['Some One', null, null, null, null, null],
      ['Commerce - SFDC Technical Analyst - EUR', null, null, null, null, null],
    ]);

    const analysis = await analyzeResourceImportWorkbook({
      fileName: 'synthetic.xlsx',
      fileSize: buffer.byteLength,
      fileBuffer: buffer,
      resourceTypes: [],
      resources: [],
      existingImportBatches: [],
    });

    expect(analysis.anomalies).toHaveLength(1);
    expect(analysis.anomalies[0]?.code).toBe('ambiguous-row');
    expect(analysis.resources).toHaveLength(0);
  });

  it('flags a person listed under two different active resource types as conflicting', async () => {
    const buffer = buildResourceWorkbookBuffer([
      [null, null, null, null, null, null],
      HEADER_ROW,
      ['Commerce - SFDC Developer - EUR', null, null, null, null, null],
      ['Some One', null, null, null, null, null],
      ['Commerce - SFDC Developer - EUR/Some.One', 1, 100, null, null, 'DATASET'],
      ['Commerce - SFDC Technical Analyst - EUR', null, null, null, null, null],
      ['Some One', null, null, null, null, null],
      ['Commerce - SFDC Technical Analyst - EUR/Some.One', 1, 100, null, null, 'DATASET'],
    ]);

    const analysis = await analyzeResourceImportWorkbook({
      fileName: 'synthetic.xlsx',
      fileSize: buffer.byteLength,
      fileBuffer: buffer,
      resourceTypes: [],
      resources: [],
      existingImportBatches: [],
    });

    expect(
      analysis.anomalies.some(
        (anomaly) =>
          anomaly.code === 'conflicting-resource-type' && anomaly.severity === 'blocking',
      ),
    ).toBe(true);
  });

  it('never persists an "[Inactive Res.]" header past the single block that follows it', async () => {
    const buffer = buildResourceWorkbookBuffer([
      [null, null, null, null, null, null],
      HEADER_ROW,
      ['Commerce - SFDC Developer - EUR', null, null, null, null, null],
      ['Someone ACTIVE', null, null, null, null, null],
      ['Commerce - SFDC Developer - EUR/Someone.ACTIVE', 1, 100, null, null, 'DATASET'],
      ['[Inactive Res.] Commerce - SFDC Developer - EUR', null, null, null, null, null],
      ['Someone INACTIVE', null, null, null, null, null],
      ['Commerce - SFDC Developer - EUR/Someone.INACTIVE', 1, 100, null, null, 'DATASET'],
      ['Someone AFTER', null, null, null, null, null],
      ['Commerce - SFDC Developer - EUR/Someone.AFTER', 1, 100, null, null, 'DATASET'],
    ]);

    const analysis = await analyzeResourceImportWorkbook({
      fileName: 'synthetic.xlsx',
      fileSize: buffer.byteLength,
      fileBuffer: buffer,
      resourceTypes: [],
      resources: [],
      existingImportBatches: [],
    });

    const names = analysis.resources.map(
      (resource) => `${resource.firstName} ${resource.lastName}`,
    );
    expect(names).toContain('Someone ACTIVE');
    expect(names).toContain('Someone AFTER');
    expect(names).not.toContain('Someone INACTIVE');
    expect(analysis.statistics.skippedInactiveCount).toBe(1);
  });
});
