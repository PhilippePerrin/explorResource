import { validateStoreValue } from '@/persistence/schemaRegistry';
import { openPlannerDb } from '@/persistence/db';
import { runTransaction } from '@/persistence/transaction';
import type { SqliteWriteOp } from '@/persistence/sqlite/types';

import type { Allocation, Group, ImportBatch, ImportRawRow, Project } from '@/domain/entities';

import type { ImportAnalysis, ImportCommitResult } from './types';

function nowIso(): string {
  return new Date().toISOString();
}

function createImportKey(parts: Array<string | number>): string {
  return parts.join('::');
}

function ensureCommitReady(analysis: ImportAnalysis): void {
  if (analysis.duplicateOf) {
    throw new Error('This file has already been imported.');
  }

  const blockingAnomalies = analysis.anomalies.filter((anomaly) => anomaly.severity === 'blocking');
  if (blockingAnomalies.length > 0) {
    throw new Error('Blocking anomalies must be resolved before the import can be committed.');
  }
}

export async function commitImportAnalysis(options: {
  analysis: ImportAnalysis;
  note?: string;
}): Promise<ImportCommitResult> {
  const { analysis, note } = options;
  ensureCommitReady(analysis);

  const db = await openPlannerDb();
  const [existingProjects, existingGroups, existingAllocations] = (await Promise.all([
    db.getAll('projects'),
    db.getAll('groups'),
    db.getAll('allocations'),
  ])) as [Project[], Group[], Allocation[]];

  const projectByCode = new Map(
    existingProjects.map((project) => [project.code, project] as const),
  );
  const groupByCode = new Map(existingGroups.map((group) => [group.code, group] as const));
  const importAllocationByLookup = new Map(
    existingAllocations
      .filter((allocation) => allocation.origin === 'import')
      .map(
        (allocation) =>
          [
            createImportKey([
              allocation.resourceId,
              allocation.projectCode,
              allocation.resourceTypeId,
              allocation.year,
              allocation.month,
            ]),
            allocation,
          ] as const,
      ),
  );

  const timestamp = nowIso();
  const importBatch: ImportBatch = validateStoreValue('importBatches', {
    id: crypto.randomUUID(),
    importedAt: timestamp,
    referenceDate: analysis.referenceDate,
    note,
    fileName: analysis.fileName,
    fileSha256: analysis.fileSha256,
    rowCount: analysis.rawRows.length,
    status: 'validated',
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  const rawRows: ImportRawRow[] = analysis.rawRows.map((row) =>
    validateStoreValue('importRawRows', {
      id: crypto.randomUUID(),
      importBatchId: importBatch.id,
      rowNumber: row.rowNumber,
      rawCells: row.rawCells,
      classification: row.classification,
      classificationConfidence: row.classificationConfidence,
      anomalyNotes: row.anomalyNotes,
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
  );

  const demandSnapshots = analysis.demandSnapshots
    .filter((snapshot) => snapshot.resourceTypeId)
    .map((snapshot) =>
      validateStoreValue('demandSnapshots', {
        id: crypto.randomUUID(),
        importBatchId: importBatch.id,
        projectCode: snapshot.projectCode,
        resourceTypeId: snapshot.resourceTypeId,
        year: snapshot.year,
        month: snapshot.month,
        demandDays: snapshot.demandDays,
        supplyDays: snapshot.supplyDays,
        origin: 'import',
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    );

  const groupsToUpsert = analysis.groups.map((group) => {
    const existing = groupByCode.get(group.code);

    return validateStoreValue('groups', {
      id: existing?.id ?? crypto.randomUUID(),
      code: group.code,
      label: group.label,
      status: 'active',
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    });
  });

  const projectsToUpsert = analysis.projects.map((project) => {
    const existing = projectByCode.get(project.code);

    return validateStoreValue('projects', {
      id: existing?.id ?? crypto.randomUUID(),
      code: project.code,
      name: project.name,
      status: 'active',
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    });
  });

  const allocationsToUpsert = analysis.allocations.flatMap((allocation) => {
    if (!allocation.resourceId || !allocation.resourceTypeId) {
      return [];
    }

    const existing = importAllocationByLookup.get(
      createImportKey([
        allocation.resourceId,
        allocation.projectCode,
        allocation.resourceTypeId,
        allocation.year,
        allocation.month,
      ]),
    );

    return [
      validateStoreValue('allocations', {
        id: existing?.id ?? crypto.randomUUID(),
        resourceId: allocation.resourceId,
        projectCode: allocation.projectCode,
        resourceTypeId: allocation.resourceTypeId,
        year: allocation.year,
        month: allocation.month,
        allocatedDays: allocation.allocatedDays,
        origin: 'import',
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      }),
    ];
  });

  const ops: SqliteWriteOp[] = [
    { store: 'importBatches', op: 'put', value: importBatch },
    ...groupsToUpsert.map((group): SqliteWriteOp => ({ store: 'groups', op: 'put', value: group })),
    ...projectsToUpsert.map((project): SqliteWriteOp => ({
      store: 'projects',
      op: 'put',
      value: project,
    })),
    ...rawRows.map((rawRow): SqliteWriteOp => ({
      store: 'importRawRows',
      op: 'put',
      value: rawRow,
    })),
    ...demandSnapshots.map((demandSnapshot): SqliteWriteOp => ({
      store: 'demandSnapshots',
      op: 'put',
      value: demandSnapshot,
    })),
    ...allocationsToUpsert.map((allocation): SqliteWriteOp => ({
      store: 'allocations',
      op: 'put',
      value: allocation,
    })),
  ];

  await runTransaction('importBatches', 'commit import batch', ops);

  const createdProjectCount = projectsToUpsert.filter(
    (project) => !projectByCode.has(project.code),
  ).length;
  const createdGroupCount = groupsToUpsert.filter((group) => !groupByCode.has(group.code)).length;

  return {
    importBatch,
    createdProjects: createdProjectCount,
    updatedProjects: projectsToUpsert.length - createdProjectCount,
    createdGroups: createdGroupCount,
    updatedGroups: groupsToUpsert.length - createdGroupCount,
    upsertedAllocations: allocationsToUpsert.length,
    importedDemandSnapshots: demandSnapshots.length,
    importedRawRows: rawRows.length,
  };
}
