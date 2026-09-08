import type { AuditEntry, DemandSnapshot, ImportBatch } from '@/domain/entities';
import { normalizeAmount } from '@/domain/normalization/normalizeAmount';
import { openPlannerDb } from '@/persistence/db';
import { withWriteErrorHandling } from '@/persistence/repository';
import { validateStoreValue } from '@/persistence/schemaRegistry';

import type {
  DemandRollbackPlan,
  DemandRollbackPlanSnapshot,
  ImportAnalysis,
  ImportComparisonItem,
  ImportComparisonProjectSummary,
  ImportComparisonSummary,
  ImportComparisonTotals,
  RestoreDemandFromImportBatchResult,
} from './types';

type ComparableDemandSnapshot = Pick<
  DemandSnapshot,
  'projectCode' | 'resourceTypeId' | 'year' | 'month' | 'demandDays' | 'supplyDays'
> &
  Partial<Pick<DemandSnapshot, 'id' | 'importBatchId' | 'origin' | 'createdAt' | 'updatedAt'>>;

function nowIso(): string {
  return new Date().toISOString();
}

export function buildDemandSnapshotComparisonKey(
  snapshot: Pick<DemandSnapshot, 'projectCode' | 'resourceTypeId' | 'year' | 'month'>,
): string {
  return `${snapshot.projectCode}::${snapshot.resourceTypeId}::${snapshot.year}::${snapshot.month}`;
}

function compareSnapshotRecency(
  left: Pick<DemandSnapshot, 'updatedAt' | 'createdAt'>,
  right: Pick<DemandSnapshot, 'updatedAt' | 'createdAt'>,
): number {
  if (left.updatedAt !== right.updatedAt) {
    return right.updatedAt.localeCompare(left.updatedAt);
  }

  return right.createdAt.localeCompare(left.createdAt);
}

function normalizeTotals(positiveDelta: number, negativeDelta: number, itemCount: number) {
  const normalizedPositiveDelta = normalizeAmount(positiveDelta);
  const normalizedNegativeDelta = normalizeAmount(negativeDelta);

  return {
    positiveDelta: normalizedPositiveDelta,
    negativeDelta: normalizedNegativeDelta,
    netDelta: normalizeAmount(normalizedPositiveDelta + normalizedNegativeDelta),
    itemCount,
  };
}

function buildTotals(
  items: readonly Pick<ImportComparisonItem, 'deltaDays' | 'state'>[],
): ImportComparisonTotals {
  const totals = items.reduce(
    (summary, item) => {
      if (item.deltaDays > 0) {
        summary.positiveDelta += item.deltaDays;
      } else if (item.deltaDays < 0) {
        summary.negativeDelta += item.deltaDays;
      }

      if (item.state !== 'unchanged') {
        summary.changedItemCount += 1;
      }

      return summary;
    },
    {
      positiveDelta: 0,
      negativeDelta: 0,
      changedItemCount: 0,
    },
  );

  return {
    ...normalizeTotals(totals.positiveDelta, totals.negativeDelta, items.length),
    changedItemCount: totals.changedItemCount,
  };
}

function sumSnapshotsByKey(
  snapshots: readonly ComparableDemandSnapshot[],
): Map<string, ComparableDemandSnapshot> {
  const snapshotByKey = new Map<string, ComparableDemandSnapshot>();

  for (const snapshot of snapshots) {
    const key = buildDemandSnapshotComparisonKey(snapshot);
    const existing = snapshotByKey.get(key);

    snapshotByKey.set(key, {
      ...snapshot,
      demandDays: normalizeAmount((existing?.demandDays ?? 0) + snapshot.demandDays),
      supplyDays: normalizeAmount((existing?.supplyDays ?? 0) + snapshot.supplyDays),
    });
  }

  return snapshotByKey;
}

function buildProjectDemandPresence(
  snapshots: Iterable<ComparableDemandSnapshot>,
): Map<string, number> {
  const totalsByProject = new Map<string, number>();

  for (const snapshot of snapshots) {
    totalsByProject.set(
      snapshot.projectCode,
      normalizeAmount((totalsByProject.get(snapshot.projectCode) ?? 0) + snapshot.demandDays),
    );
  }

  return totalsByProject;
}

function buildProjectResourceTypePresence(
  snapshots: Iterable<ComparableDemandSnapshot>,
): Map<string, number> {
  const totalsByProjectAndResourceType = new Map<string, number>();

  for (const snapshot of snapshots) {
    const key = `${snapshot.projectCode}::${snapshot.resourceTypeId}`;
    totalsByProjectAndResourceType.set(
      key,
      normalizeAmount((totalsByProjectAndResourceType.get(key) ?? 0) + snapshot.demandDays),
    );
  }

  return totalsByProjectAndResourceType;
}

function toPresenceState(total: number | undefined): boolean {
  return normalizeAmount(total ?? 0) > 0;
}

function sortLabels(labels: Iterable<string>): string[] {
  return [...new Set(labels)].sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: 'base' }),
  );
}

export function selectLatestDemandSnapshots(
  demandSnapshots: readonly DemandSnapshot[],
): DemandSnapshot[] {
  const latestByKey = new Map<string, DemandSnapshot>();

  for (const snapshot of demandSnapshots) {
    const key = buildDemandSnapshotComparisonKey(snapshot);
    const currentLatest = latestByKey.get(key);

    if (!currentLatest || compareSnapshotRecency(snapshot, currentLatest) < 0) {
      latestByKey.set(key, snapshot);
    }
  }

  return [...latestByKey.values()].sort((left, right) =>
    buildDemandSnapshotComparisonKey(left).localeCompare(buildDemandSnapshotComparisonKey(right)),
  );
}

export function buildDemandComparisonSummary(options: {
  comparedSnapshots: readonly ComparableDemandSnapshot[];
  previousBatch: Pick<ImportBatch, 'id' | 'fileName' | 'importedAt' | 'referenceDate'> | null;
  previousDemandSnapshots: readonly ComparableDemandSnapshot[];
  resourceTypeLabelsById: Map<string, string>;
}): ImportComparisonSummary {
  const { comparedSnapshots, previousBatch, previousDemandSnapshots, resourceTypeLabelsById } =
    options;
  const nextMap = sumSnapshotsByKey(comparedSnapshots);
  const previousMap = sumSnapshotsByKey(previousDemandSnapshots);
  const keys = [...new Set([...nextMap.keys(), ...previousMap.keys()])];
  const nextProjectTotals = buildProjectDemandPresence(nextMap.values());
  const previousProjectTotals = buildProjectDemandPresence(previousMap.values());
  const nextProjectResourceTypeTotals = buildProjectResourceTypePresence(nextMap.values());
  const previousProjectResourceTypeTotals = buildProjectResourceTypePresence(previousMap.values());

  const items = keys
    .map((key) => {
      const nextSnapshot = nextMap.get(key);
      const previousSnapshot = previousMap.get(key);

      if (!nextSnapshot && !previousSnapshot) {
        throw new Error(`Unable to build comparison item for key "${key}".`);
      }

      const basis = nextSnapshot ?? previousSnapshot;
      if (!basis) {
        throw new Error(`Missing snapshot basis for key "${key}".`);
      }

      const previousDemandDays = normalizeAmount(previousSnapshot?.demandDays ?? 0);
      const nextDemandDays = normalizeAmount(nextSnapshot?.demandDays ?? 0);
      const deltaDays = normalizeAmount(nextDemandDays - previousDemandDays);
      const projectPreviouslyPresent = toPresenceState(
        previousProjectTotals.get(basis.projectCode),
      );
      const projectNextPresent = toPresenceState(nextProjectTotals.get(basis.projectCode));
      const projectResourceTypeKey = `${basis.projectCode}::${basis.resourceTypeId}`;
      const resourceTypePreviouslyPresent = toPresenceState(
        previousProjectResourceTypeTotals.get(projectResourceTypeKey),
      );
      const resourceTypeNextPresent = toPresenceState(
        nextProjectResourceTypeTotals.get(projectResourceTypeKey),
      );

      const state: ImportComparisonItem['state'] =
        previousDemandDays === 0 && nextDemandDays > 0
          ? 'new'
          : previousDemandDays > 0 && nextDemandDays === 0
            ? 'removed'
            : deltaDays > 0
              ? 'increased'
              : deltaDays < 0
                ? 'decreased'
                : 'unchanged';

      return {
        key,
        projectCode: basis.projectCode,
        resourceTypeId: basis.resourceTypeId,
        resourceTypeLabel: resourceTypeLabelsById.get(basis.resourceTypeId) ?? basis.resourceTypeId,
        year: basis.year,
        month: basis.month,
        previousDemandDays,
        nextDemandDays,
        deltaDays,
        trend: deltaDays > 0 ? 'increased' : deltaDays < 0 ? 'decreased' : 'unchanged',
        projectState:
          !projectPreviouslyPresent && projectNextPresent
            ? 'new-project'
            : projectPreviouslyPresent && !projectNextPresent
              ? 'removed-project'
              : 'existing-project',
        resourceTypeState:
          !resourceTypePreviouslyPresent && resourceTypeNextPresent
            ? 'resource-type-added'
            : resourceTypePreviouslyPresent && !resourceTypeNextPresent
              ? 'resource-type-removed'
              : 'unchanged-resource-type',
        state,
      } satisfies ImportComparisonItem;
    })
    .sort(
      (left, right) =>
        Math.abs(right.deltaDays) - Math.abs(left.deltaDays) ||
        left.projectCode.localeCompare(right.projectCode, undefined, { sensitivity: 'base' }) ||
        left.resourceTypeLabel.localeCompare(right.resourceTypeLabel, undefined, {
          sensitivity: 'base',
        }) ||
        left.year - right.year ||
        left.month - right.month,
    );

  const projectSummaries = [...new Set(items.map((item) => item.projectCode))]
    .map((projectCode) => {
      const projectItems = items.filter((item) => item.projectCode === projectCode);
      const totals = buildTotals(projectItems);
      const addedResourceTypeLabels = sortLabels(
        projectItems
          .filter((item) => item.resourceTypeState === 'resource-type-added')
          .map((item) => item.resourceTypeLabel),
      );
      const removedResourceTypeLabels = sortLabels(
        projectItems
          .filter((item) => item.resourceTypeState === 'resource-type-removed')
          .map((item) => item.resourceTypeLabel),
      );

      return {
        ...totals,
        projectCode,
        newCount: projectItems.filter((item) => item.state === 'new').length,
        removedCount: projectItems.filter((item) => item.state === 'removed').length,
        increasedCount: projectItems.filter((item) => item.state === 'increased').length,
        decreasedCount: projectItems.filter((item) => item.state === 'decreased').length,
        unchangedCount: projectItems.filter((item) => item.state === 'unchanged').length,
        projectState: projectItems.some((item) => item.projectState === 'new-project')
          ? 'new-project'
          : projectItems.some((item) => item.projectState === 'removed-project')
            ? 'removed-project'
            : 'existing-project',
        addedResourceTypeLabels,
        removedResourceTypeLabels,
      } satisfies ImportComparisonProjectSummary;
    })
    .sort(
      (left, right) =>
        Math.max(
          Math.abs(right.positiveDelta),
          Math.abs(right.negativeDelta),
          Math.abs(right.netDelta),
        ) -
          Math.max(
            Math.abs(left.positiveDelta),
            Math.abs(left.negativeDelta),
            Math.abs(left.netDelta),
          ) ||
        left.projectCode.localeCompare(right.projectCode, undefined, { sensitivity: 'base' }),
    );

  const totals = buildTotals(items);

  return {
    previousBatch,
    items,
    positiveDelta: totals.positiveDelta,
    negativeDelta: totals.negativeDelta,
    netDelta: totals.netDelta,
    newCount: items.filter((item) => item.state === 'new').length,
    removedCount: items.filter((item) => item.state === 'removed').length,
    increasedCount: items.filter((item) => item.state === 'increased').length,
    decreasedCount: items.filter((item) => item.state === 'decreased').length,
    unchangedCount: items.filter((item) => item.state === 'unchanged').length,
    departmentSummary: {
      ...totals,
      label: 'Department total',
    },
    projectSummaries,
  };
}

export function buildImportComparisonSummary(options: {
  analysis: ImportAnalysis;
  previousBatch: Pick<ImportBatch, 'id' | 'fileName' | 'importedAt' | 'referenceDate'> | null;
  previousDemandSnapshots: Pick<
    DemandSnapshot,
    'projectCode' | 'resourceTypeId' | 'year' | 'month' | 'demandDays'
  >[];
  resourceTypeLabelsById: Map<string, string>;
}): ImportComparisonSummary {
  const { analysis, previousBatch, previousDemandSnapshots, resourceTypeLabelsById } = options;

  return buildDemandComparisonSummary({
    comparedSnapshots: analysis.demandSnapshots
      .filter((snapshot): snapshot is typeof snapshot & { resourceTypeId: string } =>
        Boolean(snapshot.resourceTypeId),
      )
      .map((snapshot) => ({
        projectCode: snapshot.projectCode,
        resourceTypeId: snapshot.resourceTypeId,
        year: snapshot.year,
        month: snapshot.month,
        demandDays: snapshot.demandDays,
        supplyDays: snapshot.supplyDays,
      })),
    previousBatch,
    previousDemandSnapshots: previousDemandSnapshots.map((snapshot) => ({
      ...snapshot,
      supplyDays: 0,
    })),
    resourceTypeLabelsById,
  });
}

export function buildDemandRollbackPlan(options: {
  currentSnapshots: readonly DemandSnapshot[];
  targetSnapshots: readonly DemandSnapshot[];
  targetImportBatchId: ImportBatch['id'];
  scope: DemandRollbackPlan['scope'];
}): DemandRollbackPlan {
  const { currentSnapshots, targetSnapshots, targetImportBatchId, scope } = options;
  const scopedCurrentSnapshots = currentSnapshots.filter((snapshot) =>
    scope.kind === 'all' ? true : snapshot.projectCode === scope.projectCode,
  );
  const scopedTargetSnapshots = targetSnapshots.filter((snapshot) =>
    scope.kind === 'all' ? true : snapshot.projectCode === scope.projectCode,
  );
  const currentMap = sumSnapshotsByKey(scopedCurrentSnapshots);
  const targetMap = sumSnapshotsByKey(scopedTargetSnapshots);
  const keys = [...new Set([...currentMap.keys(), ...targetMap.keys()])];
  const snapshotsToCreate: DemandRollbackPlanSnapshot[] = [];
  let unchangedCount = 0;
  let zeroedCount = 0;

  for (const key of keys) {
    const currentSnapshot = currentMap.get(key);
    const targetSnapshot = targetMap.get(key);

    if (!currentSnapshot && !targetSnapshot) {
      continue;
    }

    const basis = targetSnapshot ?? currentSnapshot;
    if (!basis) {
      continue;
    }

    const demandDays = normalizeAmount(targetSnapshot?.demandDays ?? 0);
    const supplyDays = normalizeAmount(targetSnapshot?.supplyDays ?? 0);
    const currentDemandDays = normalizeAmount(currentSnapshot?.demandDays ?? 0);
    const currentSupplyDays = normalizeAmount(currentSnapshot?.supplyDays ?? 0);

    if (demandDays === currentDemandDays && supplyDays === currentSupplyDays) {
      unchangedCount += 1;
      continue;
    }

    if (!targetSnapshot && (currentDemandDays > 0 || currentSupplyDays > 0)) {
      zeroedCount += 1;
    }

    snapshotsToCreate.push({
      key,
      projectCode: basis.projectCode,
      resourceTypeId: basis.resourceTypeId,
      year: basis.year,
      month: basis.month,
      demandDays,
      supplyDays,
      currentDemandDays,
      currentSupplyDays,
      zeroedFromCurrent: !targetSnapshot,
    });
  }

  return {
    scope,
    targetImportBatchId,
    changedCount: snapshotsToCreate.length,
    unchangedCount,
    zeroedCount,
    snapshotsToCreate: snapshotsToCreate.sort((left, right) =>
      left.key.localeCompare(right.key, undefined, { sensitivity: 'base' }),
    ),
  };
}

export async function restoreDemandFromImportBatch(options: {
  targetImportBatchId: ImportBatch['id'];
  scope: DemandRollbackPlan['scope'];
}): Promise<RestoreDemandFromImportBatchResult> {
  const { targetImportBatchId, scope } = options;
  const db = await openPlannerDb();
  const [importBatches, demandSnapshots] = await Promise.all([
    db.getAll('importBatches'),
    db.getAll('demandSnapshots'),
  ]);
  const targetBatch = importBatches.find((batch) => batch.id === targetImportBatchId);

  if (!targetBatch) {
    throw new Error('The selected import batch no longer exists.');
  }

  if (targetBatch.status !== 'validated') {
    throw new Error('Only validated import batches can be restored.');
  }

  const plan = buildDemandRollbackPlan({
    currentSnapshots: selectLatestDemandSnapshots(demandSnapshots),
    targetSnapshots: demandSnapshots.filter(
      (snapshot) => snapshot.importBatchId === targetImportBatchId,
    ),
    targetImportBatchId,
    scope,
  });

  if (plan.changedCount === 0) {
    return {
      restoredSnapshotCount: 0,
      plan,
    };
  }

  const timestamp = nowIso();
  const restoredSnapshots = plan.snapshotsToCreate.map((snapshot) =>
    validateStoreValue('demandSnapshots', {
      id: crypto.randomUUID(),
      importBatchId: 'manual',
      projectCode: snapshot.projectCode,
      resourceTypeId: snapshot.resourceTypeId,
      year: snapshot.year,
      month: snapshot.month,
      demandDays: snapshot.demandDays,
      supplyDays: snapshot.supplyDays,
      origin: 'manual-adjustment',
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
  );
  const auditEntry: AuditEntry = validateStoreValue('auditEntries', {
    id: crypto.randomUUID(),
    action: 'import-rollback',
    details: {
      scope,
      targetImportBatchId,
      targetFileName: targetBatch.fileName,
      restoredSnapshotCount: restoredSnapshots.length,
      zeroedCount: plan.zeroedCount,
    },
    timestamp,
  });

  await withWriteErrorHandling('demandSnapshots', 'restore import demand', async () => {
    const transaction = db.transaction(['demandSnapshots', 'auditEntries'], 'readwrite');

    try {
      for (const snapshot of restoredSnapshots) {
        await transaction.objectStore('demandSnapshots').put(snapshot);
      }

      await transaction.objectStore('auditEntries').put(auditEntry);
      await transaction.done;
    } catch (error) {
      transaction.abort();
      throw error;
    }
  });

  return {
    restoredSnapshotCount: restoredSnapshots.length,
    plan,
  };
}
