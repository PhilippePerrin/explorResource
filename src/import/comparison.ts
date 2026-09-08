import { normalizeAmount } from '@/domain/normalization/normalizeAmount';
import type { DemandSnapshot, ImportBatch } from '@/domain/entities';

import type { ImportComparisonItem, ImportComparisonSummary, ImportAnalysis } from './types';

function buildKey(
  projectCode: string,
  resourceTypeId: string,
  year: number,
  month: number,
): string {
  return `${projectCode}::${resourceTypeId}::${year}::${month}`;
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
  const nextMap = new Map<string, ImportComparisonItem>();

  for (const snapshot of analysis.demandSnapshots) {
    if (!snapshot.resourceTypeId) {
      continue;
    }

    const key = buildKey(
      snapshot.projectCode,
      snapshot.resourceTypeId,
      snapshot.year,
      snapshot.month,
    );
    const previous = nextMap.get(key);
    const nextDemandDays = normalizeAmount((previous?.nextDemandDays ?? 0) + snapshot.demandDays);

    nextMap.set(key, {
      key,
      projectCode: snapshot.projectCode,
      resourceTypeLabel: snapshot.resourceTypeLabel,
      year: snapshot.year,
      month: snapshot.month,
      previousDemandDays: previous?.previousDemandDays ?? 0,
      nextDemandDays,
      deltaDays: 0,
      state: 'unchanged',
    });
  }

  for (const previousSnapshot of previousDemandSnapshots) {
    const key = buildKey(
      previousSnapshot.projectCode,
      previousSnapshot.resourceTypeId,
      previousSnapshot.year,
      previousSnapshot.month,
    );
    const existing = nextMap.get(key);

    if (existing) {
      existing.previousDemandDays = normalizeAmount(
        existing.previousDemandDays + previousSnapshot.demandDays,
      );
      continue;
    }

    nextMap.set(key, {
      key,
      projectCode: previousSnapshot.projectCode,
      resourceTypeLabel:
        resourceTypeLabelsById.get(previousSnapshot.resourceTypeId) ??
        previousSnapshot.resourceTypeId,
      year: previousSnapshot.year,
      month: previousSnapshot.month,
      previousDemandDays: normalizeAmount(previousSnapshot.demandDays),
      nextDemandDays: 0,
      deltaDays: 0,
      state: 'unchanged',
    });
  }

  const items = Array.from(nextMap.values())
    .map((item) => {
      const deltaDays = normalizeAmount(item.nextDemandDays - item.previousDemandDays);
      const state: ImportComparisonItem['state'] =
        item.previousDemandDays === 0 && item.nextDemandDays > 0
          ? 'new'
          : item.previousDemandDays > 0 && item.nextDemandDays === 0
            ? 'removed'
            : deltaDays > 0
              ? 'increased'
              : deltaDays < 0
                ? 'decreased'
                : 'unchanged';

      return {
        ...item,
        deltaDays,
        state,
      };
    })
    .sort(
      (left, right) =>
        Math.abs(right.deltaDays) - Math.abs(left.deltaDays) || left.key.localeCompare(right.key),
    );

  return {
    previousBatch,
    items,
    positiveDelta: normalizeAmount(
      items.filter((item) => item.deltaDays > 0).reduce((sum, item) => sum + item.deltaDays, 0),
    ),
    negativeDelta: normalizeAmount(
      items.filter((item) => item.deltaDays < 0).reduce((sum, item) => sum + item.deltaDays, 0),
    ),
    newCount: items.filter((item) => item.state === 'new').length,
    removedCount: items.filter((item) => item.state === 'removed').length,
    increasedCount: items.filter((item) => item.state === 'increased').length,
    decreasedCount: items.filter((item) => item.state === 'decreased').length,
    unchangedCount: items.filter((item) => item.state === 'unchanged').length,
  };
}
