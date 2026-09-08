import { beforeEach, describe, expect, it } from 'vitest';

import { analyzeImportWorkbook, commitImportAnalysis } from '@/import';
import { deletePlannerDb } from '@/persistence/db';
import { createRepository } from '@/persistence/repository';

import {
  FIXTURE_RESOURCES,
  FIXTURE_RESOURCE_TYPES,
  readImportFixtureBuffer,
} from './importTestData';

const resourcesRepository = createRepository('resources');
const resourceTypesRepository = createRepository('resourceTypes');
const importBatchesRepository = createRepository('importBatches');
const demandSnapshotsRepository = createRepository('demandSnapshots');
const allocationsRepository = createRepository('allocations');
const projectsRepository = createRepository('projects');
const groupsRepository = createRepository('groups');

describe('commitImportAnalysis', () => {
  beforeEach(async () => {
    await deletePlannerDb();
    for (const resourceType of FIXTURE_RESOURCE_TYPES) {
      await resourceTypesRepository.put(resourceType);
    }
    for (const resource of FIXTURE_RESOURCES) {
      await resourcesRepository.put(resource);
    }
  });

  it('writes the parsed import in one validated batch', async () => {
    const analysis = await analyzeImportWorkbook({
      fileName: 'fixture.xlsx',
      fileSize: 1,
      fileBuffer: readImportFixtureBuffer(),
      resourceTypes: FIXTURE_RESOURCE_TYPES,
      resources: FIXTURE_RESOURCES,
      existingImportBatches: [],
    });

    const result = await commitImportAnalysis({
      analysis,
      note: 'Lot 7 test import',
    });

    expect(result.importedRawRows).toBe(166);
    expect(result.importedDemandSnapshots).toBeGreaterThan(200);
    expect(result.upsertedAllocations).toBeGreaterThan(250);

    const [batches, projects, groups, snapshots, allocations] = await Promise.all([
      importBatchesRepository.getAll(),
      projectsRepository.getAll(),
      groupsRepository.getAll(),
      demandSnapshotsRepository.getAll(),
      allocationsRepository.getAll(),
    ]);

    expect(batches).toHaveLength(1);
    expect(projects).toHaveLength(24);
    expect(groups).toHaveLength(9);
    expect(snapshots).toHaveLength(result.importedDemandSnapshots);
    expect(allocations).toHaveLength(result.upsertedAllocations);
  });
});
