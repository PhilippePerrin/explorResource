import { describe, expect, it } from 'vitest';

import {
  buildDemandComparisonSummary,
  buildDemandRollbackPlan,
  buildDemandSnapshotComparisonKey,
  selectLatestDemandSnapshots,
} from '@/import';
import type { DemandSnapshot } from '@/domain/entities';

function createSnapshot(
  overrides: Partial<DemandSnapshot> &
    Pick<DemandSnapshot, 'id' | 'projectCode' | 'resourceTypeId'>,
): DemandSnapshot {
  return {
    id: overrides.id,
    importBatchId: overrides.importBatchId ?? '11111111-1111-4111-8111-111111111111',
    projectCode: overrides.projectCode,
    resourceTypeId: overrides.resourceTypeId,
    year: overrides.year ?? 2026,
    month: overrides.month ?? 1,
    demandDays: overrides.demandDays ?? 0,
    supplyDays: overrides.supplyDays ?? 0,
    origin: overrides.origin ?? 'import',
    createdAt: overrides.createdAt ?? '2026-09-08T10:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-09-08T10:00:00.000Z',
  };
}

describe('import comparison', () => {
  it('builds comparison keys from project, type, year, and month', () => {
    expect(
      buildDemandSnapshotComparisonKey({
        projectCode: 'E0100',
        resourceTypeId: '22222222-2222-4222-8222-222222222222',
        year: 2026,
        month: 9,
      }),
    ).toBe('E0100::22222222-2222-4222-8222-222222222222::2026::9');
  });

  it('detects new and removed projects, resource-type changes, and keeps positive and negative totals separate', () => {
    const summary = buildDemandComparisonSummary({
      comparedSnapshots: [
        createSnapshot({
          id: '1',
          projectCode: 'E0100',
          resourceTypeId: '22222222-2222-4222-8222-222222222222',
          demandDays: 3.75,
        }),
        createSnapshot({
          id: '2',
          projectCode: 'E0100',
          resourceTypeId: '22222222-2222-4222-8222-222222222222',
          month: 2,
          demandDays: 1.2,
        }),
        createSnapshot({
          id: '3',
          projectCode: 'E0200',
          resourceTypeId: '22222222-2222-4222-8222-222222222222',
          demandDays: 2.25,
        }),
        createSnapshot({
          id: '4',
          projectCode: 'E0100',
          resourceTypeId: '33333333-3333-4333-8333-333333333333',
          demandDays: 4,
        }),
      ],
      previousBatch: {
        id: '44444444-4444-4444-8444-444444444444',
        fileName: 'previous.xlsx',
        importedAt: '2026-09-07T10:00:00.000Z',
        referenceDate: '2026-09-01',
      },
      previousDemandSnapshots: [
        createSnapshot({
          id: '5',
          projectCode: 'E0100',
          resourceTypeId: '22222222-2222-4222-8222-222222222222',
          demandDays: 2.5,
        }),
        createSnapshot({
          id: '6',
          projectCode: 'E0100',
          resourceTypeId: '22222222-2222-4222-8222-222222222222',
          month: 2,
          demandDays: 1.2000000000000002,
        }),
        createSnapshot({
          id: '7',
          projectCode: 'E0300',
          resourceTypeId: '22222222-2222-4222-8222-222222222222',
          demandDays: 1.1,
        }),
        createSnapshot({
          id: '8',
          projectCode: 'E0100',
          resourceTypeId: '55555555-5555-4555-8555-555555555555',
          demandDays: 2,
        }),
      ],
      resourceTypeLabelsById: new Map([
        ['22222222-2222-4222-8222-222222222222', 'Developer'],
        ['33333333-3333-4333-8333-333333333333', 'QA'],
        ['55555555-5555-4555-8555-555555555555', 'UX'],
      ]),
    });

    expect(summary.positiveDelta).toBe(7.5);
    expect(summary.negativeDelta).toBe(-3.1);
    expect(summary.netDelta).toBe(4.4);
    expect(summary.newCount).toBe(2);
    expect(summary.removedCount).toBe(2);
    expect(summary.increasedCount).toBe(1);
    expect(summary.decreasedCount).toBe(0);
    expect(summary.unchangedCount).toBe(1);
    expect(summary.departmentSummary.positiveDelta).toBe(7.5);
    expect(summary.departmentSummary.negativeDelta).toBe(-3.1);
    expect(summary.departmentSummary.netDelta).toBe(4.4);

    expect(summary.items.find((item) => item.projectCode === 'E0200')?.projectState).toBe(
      'new-project',
    );
    expect(summary.items.find((item) => item.projectCode === 'E0300')?.projectState).toBe(
      'removed-project',
    );

    const e0100Summary = summary.projectSummaries.find((item) => item.projectCode === 'E0100');
    expect(e0100Summary?.addedResourceTypeLabels).toEqual(['QA']);
    expect(e0100Summary?.removedResourceTypeLabels).toEqual(['UX']);
  });

  it('builds rollback plans that zero keys missing from the restored import', () => {
    const currentSnapshots = selectLatestDemandSnapshots([
      createSnapshot({
        id: 'old-dev',
        importBatchId: '66666666-6666-4666-8666-666666666666',
        projectCode: 'E0100',
        resourceTypeId: '22222222-2222-4222-8222-222222222222',
        demandDays: 2.5,
        updatedAt: '2026-09-07T10:00:00.000Z',
      }),
      createSnapshot({
        id: 'current-dev',
        importBatchId: '77777777-7777-4777-8777-777777777777',
        projectCode: 'E0100',
        resourceTypeId: '22222222-2222-4222-8222-222222222222',
        demandDays: 5,
        updatedAt: '2026-09-08T10:00:00.000Z',
      }),
      createSnapshot({
        id: 'current-qa',
        importBatchId: '77777777-7777-4777-8777-777777777777',
        projectCode: 'E0100',
        resourceTypeId: '33333333-3333-4333-8333-333333333333',
        demandDays: 3,
        updatedAt: '2026-09-08T10:00:00.000Z',
      }),
    ]);

    const targetSnapshots = [
      createSnapshot({
        id: 'target-dev',
        importBatchId: '66666666-6666-4666-8666-666666666666',
        projectCode: 'E0100',
        resourceTypeId: '22222222-2222-4222-8222-222222222222',
        demandDays: 2.5,
      }),
    ];

    const plan = buildDemandRollbackPlan({
      currentSnapshots,
      targetSnapshots,
      targetImportBatchId: '66666666-6666-4666-8666-666666666666',
      scope: { kind: 'project', projectCode: 'E0100' },
    });

    expect(plan.changedCount).toBe(2);
    expect(plan.zeroedCount).toBe(1);
    expect(plan.unchangedCount).toBe(0);
    expect(plan.snapshotsToCreate).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          projectCode: 'E0100',
          resourceTypeId: '22222222-2222-4222-8222-222222222222',
          demandDays: 2.5,
          currentDemandDays: 5,
          zeroedFromCurrent: false,
        }),
        expect.objectContaining({
          projectCode: 'E0100',
          resourceTypeId: '33333333-3333-4333-8333-333333333333',
          demandDays: 0,
          currentDemandDays: 3,
          zeroedFromCurrent: true,
        }),
      ]),
    );
  });
});
