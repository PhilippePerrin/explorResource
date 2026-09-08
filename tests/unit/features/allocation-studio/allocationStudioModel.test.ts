import { describe, expect, it } from 'vitest';

import {
  applyAllocationChange,
  buildSimulationPreview,
  commitAllocationStudioHistory,
  copyMonthAllocations,
  createAllocationStudioHistory,
  redoAllocationStudioHistory,
  undoAllocationStudioHistory,
} from '@/features/allocation-studio';

const baseAllocation = {
  id: '11111111-1111-1111-1111-111111111111',
  resourceId: '22222222-2222-2222-2222-222222222222',
  projectCode: 'E0100',
  resourceTypeId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  year: 2026,
  month: 5,
  allocatedDays: 4,
  origin: 'manual' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('allocationStudioModel', () => {
  it('supports simulate-ready changes plus undo/redo and month copy', () => {
    const added = applyAllocationChange([baseAllocation], {
      mode: 'add',
      resourceId: baseAllocation.resourceId,
      sourceProjectCode: '',
      projectCode: 'E0100',
      resourceTypeId: baseAllocation.resourceTypeId,
      year: 2026,
      month: 5,
      allocatedDays: 1.5,
    });

    expect(added[0]?.allocatedDays).toBe(5.5);

    const moved = applyAllocationChange(added, {
      mode: 'move',
      resourceId: baseAllocation.resourceId,
      sourceProjectCode: 'E0100',
      projectCode: 'E0200',
      resourceTypeId: baseAllocation.resourceTypeId,
      year: 2026,
      month: 5,
      allocatedDays: 2,
    });

    expect(moved.find((item) => item.projectCode === 'E0100')?.allocatedDays).toBe(3.5);
    expect(moved.find((item) => item.projectCode === 'E0200')?.allocatedDays).toBe(2);

    const history = commitAllocationStudioHistory(
      createAllocationStudioHistory([baseAllocation]),
      moved,
    );
    const undone = undoAllocationStudioHistory(history);
    const redone = redoAllocationStudioHistory(undone);
    expect(undone.present[0]?.allocatedDays).toBe(4);
    expect(redone.present.find((item) => item.projectCode === 'E0200')?.allocatedDays).toBe(2);

    const copied = copyMonthAllocations({
      allocations: moved,
      year: 2026,
      sourceMonth: 5,
      targetMonth: 6,
      resourceTypeId: baseAllocation.resourceTypeId,
    });
    expect(copied.some((item) => item.month === 6 && item.projectCode === 'E0200')).toBe(true);

    const preview = buildSimulationPreview({
      currentAllocations: [baseAllocation],
      simulatedAllocations: moved,
      change: {
        mode: 'move',
        resourceId: baseAllocation.resourceId,
        sourceProjectCode: 'E0100',
        projectCode: 'E0200',
        resourceTypeId: baseAllocation.resourceTypeId,
        year: 2026,
        month: 5,
        allocatedDays: 2,
      },
      resources: [
        {
          id: baseAllocation.resourceId,
          firstName: 'Alice',
          lastName: 'Martin',
          resourceTypeId: baseAllocation.resourceTypeId,
          collaborationType: 'internal',
          status: 'active',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      workingDaysCalendars: [
        {
          id: '33333333-3333-3333-3333-333333333333',
          year: 2026,
          month: 5,
          workingDaysCount: 10,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      resourceNonWorkingDays: [],
      appSettings: null,
      demandSnapshots: [
        {
          id: '44444444-4444-4444-4444-444444444444',
          importBatchId: 'manual',
          projectCode: 'E0200',
          resourceTypeId: baseAllocation.resourceTypeId,
          year: 2026,
          month: 5,
          demandDays: 1,
          supplyDays: 0,
          origin: 'manual-adjustment',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    expect(preview?.afterResourceSummary.assignedLoadDays).toBe(5.5);
    expect(preview?.afterDemandSummary.overServiceDays).toBe(1);
  });
});
