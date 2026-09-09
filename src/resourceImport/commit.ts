import { getResourceFullName } from '@/domain/entities';
import { openPlannerDb } from '@/persistence/db';
import { withWriteErrorHandling } from '@/persistence/repository';
import { validateStoreValue } from '@/persistence/schemaRegistry';

import type { ResourceImportAnalysis, ResourceImportCommitResult } from './types';

const NEW_RESOURCE_TYPE_COLOR_PALETTE = ['#00427f', '#00856a', '#7f4b00', '#5b2a86', '#8a1f3d'];

function nowIso(): string {
  return new Date().toISOString();
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function ensureCommitReady(analysis: ResourceImportAnalysis): void {
  if (analysis.duplicateOf) {
    throw new Error('This file has already been imported.');
  }

  const blockingAnomalies = analysis.anomalies.filter((anomaly) => anomaly.severity === 'blocking');
  if (blockingAnomalies.length > 0) {
    throw new Error('Blocking anomalies must be resolved before the import can be committed.');
  }
}

export async function commitResourceImportAnalysis(options: {
  analysis: ResourceImportAnalysis;
  note?: string;
}): Promise<ResourceImportCommitResult> {
  const { analysis, note } = options;
  ensureCommitReady(analysis);

  const db = await openPlannerDb();
  const [existingResourceTypes, existingResources, existingAllocations] = await Promise.all([
    db.getAll('resourceTypes'),
    db.getAll('resources'),
    db.getAll('allocations'),
  ]);

  const resourceTypeByLabel = new Map(
    existingResourceTypes.map((resourceType) => [resourceType.label.trim(), resourceType] as const),
  );
  const resourceById = new Map(
    existingResources.map((resource) => [resource.id, resource] as const),
  );
  const resourceIdsWithAllocations = new Set(
    existingAllocations.map((allocation) => allocation.resourceId),
  );

  const timestamp = nowIso();
  let nextDisplayOrder =
    existingResourceTypes.reduce(
      (max, resourceType) => Math.max(max, resourceType.displayOrder),
      -1,
    ) + 1;
  let paletteIndex = 0;

  const resourceTypesToUpsert = analysis.resourceTypesToCreate
    .filter((staged) => !resourceTypeByLabel.has(staged.label))
    .map((staged) => {
      const color =
        NEW_RESOURCE_TYPE_COLOR_PALETTE[paletteIndex % NEW_RESOURCE_TYPE_COLOR_PALETTE.length];
      paletteIndex += 1;

      const validated = validateStoreValue('resourceTypes', {
        id: crypto.randomUUID(),
        label: staged.label,
        color,
        status: 'active',
        displayOrder: nextDisplayOrder,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      nextDisplayOrder += 1;
      resourceTypeByLabel.set(validated.label, validated);
      return validated;
    });

  const resourcesToCreate: ReturnType<typeof validateStoreValue<'resources'>>[] = [];
  const resourcesToUpdate: ReturnType<typeof validateStoreValue<'resources'>>[] = [];
  const skippedTypeChanges: ResourceImportCommitResult['skippedTypeChanges'] = [];

  for (const staged of analysis.resources) {
    if (staged.action === 'unchanged') {
      continue;
    }

    const resourceType = resourceTypeByLabel.get(staged.resourceTypeLabel);
    if (!resourceType) {
      continue;
    }

    if (staged.matchedResourceId) {
      const existing = resourceById.get(staged.matchedResourceId);
      if (!existing) {
        continue;
      }

      if (
        existing.resourceTypeId !== resourceType.id &&
        resourceIdsWithAllocations.has(existing.id)
      ) {
        skippedTypeChanges.push({
          resourceId: existing.id,
          fullName: getResourceFullName(existing),
          attemptedResourceTypeLabel: staged.resourceTypeLabel,
        });
        continue;
      }

      resourcesToUpdate.push(
        validateStoreValue('resources', {
          ...existing,
          resourceTypeId: resourceType.id,
          updatedAt: timestamp,
        }),
      );
      continue;
    }

    resourcesToCreate.push(
      validateStoreValue('resources', {
        id: crypto.randomUUID(),
        firstName: staged.firstName,
        lastName: staged.lastName,
        resourceTypeId: resourceType.id,
        collaborationType: 'internal',
        status: 'active',
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    );
  }

  const importBatch = validateStoreValue('importBatches', {
    id: crypto.randomUUID(),
    importedAt: timestamp,
    referenceDate: todayIsoDate(),
    note,
    fileName: analysis.fileName,
    fileSha256: analysis.fileSha256,
    rowCount: analysis.rawRows.length,
    status: 'validated',
    kind: 'resource',
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  await withWriteErrorHandling('importBatches', 'commit resource import batch', async () => {
    const transaction = db.transaction(
      ['resourceTypes', 'resources', 'importBatches'],
      'readwrite',
    );

    try {
      for (const resourceType of resourceTypesToUpsert) {
        await transaction.objectStore('resourceTypes').put(resourceType);
      }

      for (const resource of [...resourcesToCreate, ...resourcesToUpdate]) {
        await transaction.objectStore('resources').put(resource);
      }

      await transaction.objectStore('importBatches').put(importBatch);

      await transaction.done;
    } catch (error) {
      transaction.abort();
      throw error;
    }
  });

  return {
    importBatch,
    createdResourceTypes: resourceTypesToUpsert.length,
    createdResources: resourcesToCreate.length,
    updatedResources: resourcesToUpdate.length,
    unchangedResources: analysis.resources.filter((resource) => resource.action === 'unchanged')
      .length,
    skippedTypeChanges,
  };
}
