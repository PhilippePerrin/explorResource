import { describe, expect, it } from 'vitest';

import { analyzeImportWorkbook } from '@/import';
import { analyzeResourceImportWorkbook } from '@/resourceImport/parse';
import type { Resource, ResourceType } from '@/domain/entities';

import { readImportFixtureBuffer } from './importTestData';
import { readResourceImportFixtureBuffer } from '../resourceImport/resourceImportTestData';

/**
 * Formal regression test for the root cause diagnosed for "l'import ne fonctionne pas":
 * a fresh app has no Resources/ResourceTypes, so every demand/supply row in the real
 * demand workbook is flagged as a *blocking* unknown-resource(-type) anomaly and the
 * import can never be committed. Running the resource importer first (against the
 * matching Availability list export) must produce a resource/type set that lets the
 * demand importer complete with zero blocking anomalies.
 */
describe('resource import followed by demand import', () => {
  it('produces zero blocking anomalies in the demand workbook once resources are staged', async () => {
    const resourceAnalysis = await analyzeResourceImportWorkbook({
      fileName: 'export-resource.xlsx',
      fileSize: readResourceImportFixtureBuffer().byteLength,
      fileBuffer: readResourceImportFixtureBuffer(),
      resourceTypes: [],
      resources: [],
      existingImportBatches: [],
    });

    expect(resourceAnalysis.anomalies).toHaveLength(0);

    const resourceTypes: ResourceType[] = resourceAnalysis.resourceTypesToCreate.map(
      (staged, index) => ({
        id: `00000000-0000-4000-8000-00000000000${index}`,
        label: staged.label,
        color: '#00427f',
        status: 'active',
        displayOrder: index,
        createdAt: '2026-09-08T10:00:00.000Z',
        updatedAt: '2026-09-08T10:00:00.000Z',
      }),
    );
    const resourceTypeIdByLabel = new Map(resourceTypes.map((type) => [type.label, type.id]));

    const resources: Resource[] = resourceAnalysis.resources.map((staged, index) => ({
      id: `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`,
      firstName: staged.firstName,
      lastName: staged.lastName,
      resourceTypeId: resourceTypeIdByLabel.get(staged.resourceTypeLabel)!,
      collaborationType: 'internal',
      status: 'active',
      createdAt: '2026-09-08T10:00:00.000Z',
      updatedAt: '2026-09-08T10:00:00.000Z',
    }));

    const demandAnalysis = await analyzeImportWorkbook({
      fileName: 'export-philippe.perrin-151251-20260908-101608.xlsx',
      fileSize: readImportFixtureBuffer().byteLength,
      fileBuffer: readImportFixtureBuffer(),
      resourceTypes,
      resources,
      existingImportBatches: [],
    });

    const blockingAnomalies = demandAnalysis.anomalies.filter(
      (anomaly) => anomaly.severity === 'blocking',
    );

    expect(blockingAnomalies).toHaveLength(0);
  });

  it('blocks the demand import with unknown-resource(-type) anomalies when no resources exist', async () => {
    const demandAnalysis = await analyzeImportWorkbook({
      fileName: 'export-philippe.perrin-151251-20260908-101608.xlsx',
      fileSize: readImportFixtureBuffer().byteLength,
      fileBuffer: readImportFixtureBuffer(),
      resourceTypes: [],
      resources: [],
      existingImportBatches: [],
    });

    const blockingAnomalies = demandAnalysis.anomalies.filter(
      (anomaly) => anomaly.severity === 'blocking',
    );

    expect(blockingAnomalies.length).toBeGreaterThan(0);
    expect(blockingAnomalies.some((anomaly) => anomaly.code === 'unknown-resource-type')).toBe(
      true,
    );
    expect(blockingAnomalies.some((anomaly) => anomaly.code === 'unknown-resource')).toBe(true);
  });
});
