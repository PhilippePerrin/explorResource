import { beforeEach, describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';

import { analyzeResourceImportWorkbook } from '@/resourceImport/parse';
import { commitResourceImportAnalysis } from '@/resourceImport/commit';
import { deletePlannerDb } from '@/persistence/db';
import { createRepository } from '@/persistence/repository';
import type { Resource, ResourceType } from '@/domain/entities';

import { readResourceImportFixtureBuffer } from './resourceImportTestData';

const resourcesRepository = createRepository('resources');
const resourceTypesRepository = createRepository('resourceTypes');
const importBatchesRepository = createRepository('importBatches');
const allocationsRepository = createRepository('allocations');

function buildResourceWorkbookBuffer(rows: (string | number | null)[][]): ArrayBuffer {
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Availability list');
  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

const HEADER_ROW = ['Resource', 'Quantity', 'Percentage', 'Start date', 'Finish date', 'File'];

describe('commitResourceImportAnalysis', () => {
  beforeEach(async () => {
    await deletePlannerDb();
  });

  it('creates all resource types and resources from a clean import', async () => {
    const buffer = readResourceImportFixtureBuffer();
    const analysis = await analyzeResourceImportWorkbook({
      fileName: 'export-resource.xlsx',
      fileSize: buffer.byteLength,
      fileBuffer: buffer,
      resourceTypes: [],
      resources: [],
      existingImportBatches: [],
    });

    const result = await commitResourceImportAnalysis({
      analysis,
      note: 'Initial resource import',
    });

    expect(result.createdResourceTypes).toBe(3);
    expect(result.createdResources).toBe(23);
    expect(result.updatedResources).toBe(0);
    expect(result.unchangedResources).toBe(0);
    expect(result.skippedTypeChanges).toHaveLength(0);
    expect(result.importBatch.kind).toBe('resource');
    expect(result.importBatch.status).toBe('validated');

    const [resourceTypes, resources, batches] = await Promise.all([
      resourceTypesRepository.getAll(),
      resourcesRepository.getAll(),
      importBatchesRepository.getAll(),
    ]);

    expect(resourceTypes).toHaveLength(3);
    expect(resources).toHaveLength(23);
    expect(batches).toHaveLength(1);
    expect(resources.every((resource) => resource.collaborationType === 'internal')).toBe(true);
    expect(resources.every((resource) => resource.status === 'active')).toBe(true);
  });

  it('blocks a second commit attempt of the identical file as a duplicate', async () => {
    const buffer = readResourceImportFixtureBuffer();
    const firstAnalysis = await analyzeResourceImportWorkbook({
      fileName: 'export-resource.xlsx',
      fileSize: buffer.byteLength,
      fileBuffer: buffer,
      resourceTypes: [],
      resources: [],
      existingImportBatches: [],
    });
    await commitResourceImportAnalysis({ analysis: firstAnalysis });

    const batches = await importBatchesRepository.getAll();

    const secondAnalysis = await analyzeResourceImportWorkbook({
      fileName: 'export-resource.xlsx',
      fileSize: buffer.byteLength,
      fileBuffer: buffer,
      resourceTypes: [],
      resources: [],
      existingImportBatches: batches,
    });

    expect(secondAnalysis.duplicateOf).toBeDefined();
    await expect(commitResourceImportAnalysis({ analysis: secondAnalysis })).rejects.toThrow(
      /already been imported/,
    );

    expect(await resourcesRepository.getAll()).toHaveLength(23);
    expect(await importBatchesRepository.getAll()).toHaveLength(1);
  });

  it('skips an in-place type change and reports it when the resource already has allocations', async () => {
    const typeA: ResourceType = {
      id: '2b973647-498d-4c42-8d90-71f668f30c2e',
      label: 'Commerce - SFDC Developer - EUR',
      color: '#00427f',
      status: 'active',
      displayOrder: 1,
      createdAt: '2026-09-08T10:00:00.000Z',
      updatedAt: '2026-09-08T10:00:00.000Z',
    };
    const existingResource: Resource = {
      id: '1d81d9fd-f2c4-4e42-8247-c8dcf5906d82',
      firstName: 'Zakaria',
      lastName: 'IDER',
      resourceTypeId: typeA.id,
      collaborationType: 'internal',
      status: 'active',
      createdAt: '2026-09-08T10:00:00.000Z',
      updatedAt: '2026-09-08T10:00:00.000Z',
    };
    await resourceTypesRepository.put(typeA);
    await resourcesRepository.put(existingResource);
    await allocationsRepository.put({
      id: 'a0000000-0000-4000-8000-000000000000',
      resourceId: existingResource.id,
      projectCode: 'E0100',
      resourceTypeId: typeA.id,
      year: 2026,
      month: 1,
      allocatedDays: 5,
      origin: 'manual',
      createdAt: '2026-09-08T10:00:00.000Z',
      updatedAt: '2026-09-08T10:00:00.000Z',
    });

    const buffer = buildResourceWorkbookBuffer([
      [null, null, null, null, null, null],
      HEADER_ROW,
      ['Commerce - SFDC Release & Platform - EUR', null, null, null, null, null],
      ['Zakaria IDER', null, null, null, null, null],
      ['Commerce - SFDC Release & Platform - EUR/Zakaria.IDER', 1, 100, null, null, 'DATASET'],
    ]);

    const analysis = await analyzeResourceImportWorkbook({
      fileName: 'synthetic-type-change.xlsx',
      fileSize: buffer.byteLength,
      fileBuffer: buffer,
      resourceTypes: [typeA],
      resources: [existingResource],
      existingImportBatches: [],
    });

    const zakariaStaged = analysis.resources.find(
      (resource) => resource.firstName === 'Zakaria' && resource.lastName === 'IDER',
    );
    expect(zakariaStaged?.action).toBe('update');
    expect(analysis.anomalies).toHaveLength(0);

    const result = await commitResourceImportAnalysis({ analysis });

    expect(result.createdResourceTypes).toBe(1);
    expect(result.updatedResources).toBe(0);
    expect(result.skippedTypeChanges).toHaveLength(1);
    expect(result.skippedTypeChanges[0]?.fullName).toBe('Zakaria IDER');
    expect(result.skippedTypeChanges[0]?.attemptedResourceTypeLabel).toBe(
      'Commerce - SFDC Release & Platform - EUR',
    );

    const finalResource = (await resourcesRepository.getAll()).find(
      (resource) => resource.id === existingResource.id,
    );
    expect(finalResource?.resourceTypeId).toBe(typeA.id);
  });
});
