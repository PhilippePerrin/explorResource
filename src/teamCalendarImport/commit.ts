import type { ResourceNonWorkingDays } from '@/domain/entities';
import {
  createNonWorkingDayMutationPlan,
  type NonWorkingDayRow,
} from '@/features/non-working-days/nonWorkingDaysModel';
import { openPlannerDb } from '@/persistence/db';
import { validateStoreValue } from '@/persistence/schemaRegistry';
import type { SqliteWriteOp } from '@/persistence/sqlite/types';
import { runTransaction } from '@/persistence/transaction';

import type { TeamCalendarAnalysis, TeamCalendarCommitResult } from './types';

function nowIso(): string {
  return new Date().toISOString();
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function ensureCommitReady(analysis: TeamCalendarAnalysis): void {
  if (analysis.duplicateOf) {
    throw new Error('This file has already been imported.');
  }

  const blockingAnomalies = analysis.anomalies.filter((anomaly) => anomaly.severity === 'blocking');
  if (blockingAnomalies.length > 0) {
    throw new Error('Blocking anomalies must be resolved before the import can be committed.');
  }
}

export async function commitTeamCalendarAnalysis(options: {
  analysis: TeamCalendarAnalysis;
  note?: string;
}): Promise<TeamCalendarCommitResult> {
  const { analysis, note } = options;
  ensureCommitReady(analysis);

  const db = await openPlannerDb();
  const existingEntries = (await db.getAll(
    'resourceNonWorkingDays',
  )) as ResourceNonWorkingDays[];

  const timestamp = nowIso();
  const ops: SqliteWriteOp[] = [];
  let upsertedMonths = 0;
  let deletedMonths = 0;
  const affectedResourceIds = new Set<string>();

  const totalsByYear = new Map<number, typeof analysis.monthlyTotals>();
  for (const total of analysis.monthlyTotals) {
    const forYear = totalsByYear.get(total.year) ?? [];
    forYear.push(total);
    totalsByYear.set(total.year, forYear);
  }

  for (const [year, totalsForYear] of totalsByYear) {
    const existingEntriesForYear = existingEntries.filter((entry) => entry.year === year);
    const resourceIdsThisYear = new Set(totalsForYear.map((total) => total.resourceId));

    const rows: NonWorkingDayRow[] = Array.from(resourceIdsThisYear, (resourceId) => {
      const resourceName =
        totalsForYear.find((total) => total.resourceId === resourceId)?.resourceName ?? '';
      const values = Array.from({ length: 12 }, (_, index) => {
        const month = index + 1;
        const importedTotal = totalsForYear.find(
          (total) => total.resourceId === resourceId && total.month === month,
        );
        if (importedTotal) {
          return importedTotal.days;
        }
        return (
          existingEntriesForYear.find(
            (entry) => entry.resourceId === resourceId && entry.month === month,
          )?.days ?? 0
        );
      });

      return { resourceId, resourceName, resourceStatus: 'active' as const, values };
    });

    const { upserts, deletes } = createNonWorkingDayMutationPlan(
      year,
      rows,
      existingEntriesForYear,
      timestamp,
    );

    for (const upsert of upserts) {
      ops.push({
        store: 'resourceNonWorkingDays',
        op: 'put',
        value: validateStoreValue('resourceNonWorkingDays', upsert),
      });
      affectedResourceIds.add(upsert.resourceId);
      upsertedMonths += 1;
    }

    for (const id of deletes) {
      ops.push({ store: 'resourceNonWorkingDays', op: 'delete', id });
      deletedMonths += 1;
    }
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
    kind: 'non-working-days',
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  ops.push({ store: 'importBatches', op: 'put', value: importBatch });

  await runTransaction('importBatches', 'commit team calendar import batch', ops);

  return {
    importBatch,
    upsertedMonths,
    deletedMonths,
    affectedResourceCount: affectedResourceIds.size,
    affectedYears: Array.from(totalsByYear.keys()).sort((a, b) => a - b),
  };
}
