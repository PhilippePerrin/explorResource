import { describe, expect, it } from 'vitest';

import {
  applyAllocationChange,
  applyAllocationChangeBatch,
  buildAllocationStudioBoardRows,
  buildAllocationStudioRows,
  buildBatchSimulationPreview,
  buildResourceBenchRows,
  buildSimulationPreview,
  commitAllocationStudioHistory,
  copyMonthAllocations,
  createAllocationStudioHistory,
  redoAllocationStudioHistory,
  resolveAllocationStudioRowStatus,
  resolveDefaultDropDays,
  resolveMultiMonthDropDays,
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

const baseResource = {
  id: baseAllocation.resourceId,
  firstName: 'Alice',
  lastName: 'Martin',
  resourceTypeId: baseAllocation.resourceTypeId,
  collaborationType: 'internal' as const,
  status: 'active' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const baseResourceType = {
  id: baseAllocation.resourceTypeId,
  label: 'Developer',
  shortCode: 'DEV',
  color: '#00427f',
  status: 'active' as const,
  displayOrder: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const baseWorkingDaysCalendar = {
  id: '33333333-3333-3333-3333-333333333333',
  year: 2026,
  month: 5,
  workingDaysCount: 10,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const validatedImportBatch = {
  id: '99999999-9999-9999-9999-999999999999',
  importedAt: '2026-01-01T00:00:00.000Z',
  referenceDate: '2026-01-01',
  fileName: 'demand.xlsx',
  fileSha256: 'a'.repeat(64),
  rowCount: 1,
  status: 'validated' as const,
  kind: 'demand' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const draftImportBatch = {
  ...validatedImportBatch,
  id: '99999999-9999-9999-9999-999999999998',
  status: 'draft' as const,
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
      origin: 'manual',
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
      origin: 'drag-and-drop',
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
        origin: 'drag-and-drop',
      },
      resources: [baseResource],
      workingDaysCalendars: [baseWorkingDaysCalendar],
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

  it('stamps the origin supplied by the caller rather than a hardcoded value', () => {
    const manualResult = applyAllocationChange([], {
      mode: 'add',
      resourceId: baseAllocation.resourceId,
      sourceProjectCode: '',
      projectCode: 'E0300',
      resourceTypeId: baseAllocation.resourceTypeId,
      year: 2026,
      month: 5,
      allocatedDays: 2,
      origin: 'manual',
    });

    expect(manualResult[0]?.origin).toBe('manual');

    const dragResult = applyAllocationChange([], {
      mode: 'add',
      resourceId: baseAllocation.resourceId,
      sourceProjectCode: '',
      projectCode: 'E0300',
      resourceTypeId: baseAllocation.resourceTypeId,
      year: 2026,
      month: 5,
      allocatedDays: 2,
      origin: 'drag-and-drop',
    });

    expect(dragResult[0]?.origin).toBe('drag-and-drop');

    const updatedViaSet = applyAllocationChange(dragResult, {
      mode: 'set',
      resourceId: baseAllocation.resourceId,
      sourceProjectCode: '',
      projectCode: 'E0300',
      resourceTypeId: baseAllocation.resourceTypeId,
      year: 2026,
      month: 5,
      allocatedDays: 5,
      origin: 'manual',
    });

    expect(updatedViaSet[0]?.origin).toBe('manual');
  });

  describe('buildAllocationStudioRows', () => {
    it('returns no rows when there is neither demand nor allocation', () => {
      const rows = buildAllocationStudioRows({
        projects: [],
        resourceTypes: [baseResourceType],
        resources: [baseResource],
        demandSnapshots: [],
        allocations: [],
        year: 2026,
        resourceTypeFilter: 'all',
        projectSearch: '',
      });

      expect(rows).toHaveLength(0);
    });

    it('surfaces a row from a demand snapshot with zero allocations', () => {
      const rows = buildAllocationStudioRows({
        projects: [],
        resourceTypes: [baseResourceType],
        resources: [baseResource],
        demandSnapshots: [
          {
            id: '55555555-5555-5555-5555-555555555555',
            importBatchId: 'manual',
            projectCode: 'E0100',
            resourceTypeId: baseAllocation.resourceTypeId,
            year: 2026,
            month: 3,
            demandDays: 4,
            supplyDays: 0,
            origin: 'manual-adjustment',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        allocations: [],
        year: 2026,
        resourceTypeFilter: 'all',
        projectSearch: '',
      });

      expect(rows).toHaveLength(1);
      expect(rows[0]?.months[2]?.demandDays).toBe(4);
      expect(rows[0]?.months[2]?.allocatedDays).toBe(0);
    });

    it('surfaces a row from an allocation with no matching demand snapshot', () => {
      const rows = buildAllocationStudioRows({
        projects: [],
        resourceTypes: [baseResourceType],
        resources: [baseResource],
        demandSnapshots: [],
        allocations: [baseAllocation],
        year: 2026,
        resourceTypeFilter: 'all',
        projectSearch: '',
      });

      expect(rows).toHaveLength(1);
      expect(rows[0]?.months[4]?.demandDays).toBe(0);
      expect(rows[0]?.months[4]?.allocatedDays).toBe(4);
    });

    it('filters by resource type and project search', () => {
      const rows = buildAllocationStudioRows({
        projects: [
          {
            id: '66666666-6666-6666-6666-666666666666',
            code: 'E0100',
            name: 'Commercial Analytics',
            status: 'active',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        resourceTypes: [baseResourceType],
        resources: [baseResource],
        demandSnapshots: [],
        allocations: [baseAllocation],
        year: 2026,
        resourceTypeFilter: 'other-type',
        projectSearch: '',
      });

      expect(rows).toHaveLength(0);

      const searched = buildAllocationStudioRows({
        projects: [
          {
            id: '66666666-6666-6666-6666-666666666666',
            code: 'E0100',
            name: 'Commercial Analytics',
            status: 'active',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        resourceTypes: [baseResourceType],
        resources: [baseResource],
        demandSnapshots: [],
        allocations: [baseAllocation],
        year: 2026,
        resourceTypeFilter: 'all',
        projectSearch: 'commercial',
      });

      expect(searched).toHaveLength(1);

      const missed = buildAllocationStudioRows({
        projects: [],
        resourceTypes: [baseResourceType],
        resources: [baseResource],
        demandSnapshots: [],
        allocations: [baseAllocation],
        year: 2026,
        resourceTypeFilter: 'all',
        projectSearch: 'no-match',
      });

      expect(missed).toHaveLength(0);
    });
  });

  describe('buildResourceBenchRows', () => {
    const idleResource = {
      ...baseResource,
      id: '77777777-7777-7777-7777-777777777777',
      firstName: 'Bob',
      lastName: 'Idle',
    };
    const archivedResource = {
      ...baseResource,
      id: '88888888-8888-8888-8888-888888888888',
      firstName: 'Carol',
      lastName: 'Archived',
      status: 'archived' as const,
    };

    it('sorts by available capacity descending and excludes inactive resources', () => {
      const rows = buildResourceBenchRows({
        resources: [baseResource, idleResource, archivedResource],
        resourceTypes: [baseResourceType],
        year: 2026,
        month: 5,
        workingDaysCalendars: [baseWorkingDaysCalendar],
        resourceNonWorkingDays: [],
        allocations: [baseAllocation],
        appSettings: null,
        resourceTypeFilter: 'all',
        searchTerm: '',
      });

      expect(rows.map((row) => row.resource.id)).toEqual([idleResource.id, baseResource.id]);
    });

    it('filters by resource type', () => {
      const rows = buildResourceBenchRows({
        resources: [baseResource],
        resourceTypes: [baseResourceType],
        year: 2026,
        month: 5,
        workingDaysCalendars: [baseWorkingDaysCalendar],
        resourceNonWorkingDays: [],
        allocations: [],
        appSettings: null,
        resourceTypeFilter: 'unrelated-type',
        searchTerm: '',
      });

      expect(rows).toHaveLength(0);
    });

    it('filters by search term against the resource full name', () => {
      const rows = buildResourceBenchRows({
        resources: [baseResource, idleResource],
        resourceTypes: [baseResourceType],
        year: 2026,
        month: 5,
        workingDaysCalendars: [baseWorkingDaysCalendar],
        resourceNonWorkingDays: [],
        allocations: [],
        appSettings: null,
        resourceTypeFilter: 'all',
        searchTerm: 'idle',
      });

      expect(rows).toHaveLength(1);
      expect(rows[0]?.resource.id).toBe(idleResource.id);
    });
  });

  describe('resolveDefaultDropDays', () => {
    it('defaults to the remaining demand gap when there is one', () => {
      expect(resolveDefaultDropDays({ remainingDemandDays: 2.5 })).toBe(2.5);
    });

    it('never proposes zero, defaulting to 1 instead', () => {
      expect(resolveDefaultDropDays({ remainingDemandDays: 0 })).toBe(1);
    });
  });

  describe('resolveAllocationStudioRowStatus', () => {
    it('returns "none" when no month has a backing demand snapshot', () => {
      expect(
        resolveAllocationStudioRowStatus([{ importBatchId: null }, { importBatchId: null }], []),
      ).toBe('none');
    });

    it('returns the single status when every month agrees', () => {
      expect(
        resolveAllocationStudioRowStatus(
          [{ importBatchId: validatedImportBatch.id }, { importBatchId: validatedImportBatch.id }],
          [validatedImportBatch],
        ),
      ).toBe('validated');
    });

    it('returns "manual" for the manual importBatchId marker', () => {
      expect(resolveAllocationStudioRowStatus([{ importBatchId: 'manual' }], [])).toBe('manual');
    });

    it('returns "mixed" when months disagree across import batches', () => {
      expect(
        resolveAllocationStudioRowStatus(
          [{ importBatchId: validatedImportBatch.id }, { importBatchId: draftImportBatch.id }],
          [validatedImportBatch, draftImportBatch],
        ),
      ).toBe('mixed');
    });
  });

  describe('buildAllocationStudioBoardRows', () => {
    const project = {
      id: '66666666-6666-6666-6666-666666666666',
      code: 'E0100',
      name: 'Commercial Analytics',
      status: 'active' as const,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    it('sums Total supply / Total demand across all 12 months', () => {
      const blocks = buildAllocationStudioBoardRows({
        projects: [project],
        resourceTypes: [baseResourceType],
        resources: [baseResource],
        demandSnapshots: [
          {
            id: '55555555-5555-5555-5555-555555555555',
            importBatchId: validatedImportBatch.id,
            projectCode: 'E0100',
            resourceTypeId: baseAllocation.resourceTypeId,
            year: 2026,
            month: 3,
            demandDays: 4,
            supplyDays: 2,
            origin: 'import',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        importBatches: [validatedImportBatch],
        allocations: [],
        year: 2026,
        resourceTypeFilter: 'all',
        projectSearch: '',
      });

      expect(blocks).toHaveLength(1);
      expect(blocks[0]?.demandLine.totalDemandDays).toBe(4);
      expect(blocks[0]?.demandLine.totalSupplyDays).toBe(2);
      expect(blocks[0]?.demandLine.status).toBe('validated');
    });

    it('produces one assignment row per resource with a non-zero month, mirroring parent totals', () => {
      const blocks = buildAllocationStudioBoardRows({
        projects: [project],
        resourceTypes: [baseResourceType],
        resources: [baseResource],
        demandSnapshots: [],
        importBatches: [],
        allocations: [baseAllocation],
        year: 2026,
        resourceTypeFilter: 'all',
        projectSearch: '',
      });

      expect(blocks).toHaveLength(1);
      expect(blocks[0]?.assignments).toHaveLength(1);
      const assignment = blocks[0]?.assignments[0];
      expect(assignment?.resourceId).toBe(baseResource.id);
      expect(assignment?.resourceName).toBe('Alice Martin');
      expect(assignment?.months[4]?.allocatedDays).toBe(4);
      expect(assignment?.months[0]?.allocatedDays).toBe(0);
      expect(assignment?.status).toBe('none');
      expect(assignment?.totalSupplyDays).toBe(blocks[0]?.demandLine.totalSupplyDays);
      expect(assignment?.totalDemandDays).toBe(blocks[0]?.demandLine.totalDemandDays);
    });

    it('does not produce an assignment row for a resource whose allocations net to zero', () => {
      const cancelledOut = applyAllocationChange([baseAllocation], {
        mode: 'set',
        resourceId: baseAllocation.resourceId,
        sourceProjectCode: '',
        projectCode: baseAllocation.projectCode,
        resourceTypeId: baseAllocation.resourceTypeId,
        year: baseAllocation.year,
        month: baseAllocation.month,
        allocatedDays: 0,
        origin: 'manual',
      });

      const blocks = buildAllocationStudioBoardRows({
        projects: [project],
        resourceTypes: [baseResourceType],
        resources: [baseResource],
        demandSnapshots: [],
        importBatches: [],
        allocations: cancelledOut,
        year: 2026,
        resourceTypeFilter: 'all',
        projectSearch: '',
      });

      expect(blocks).toHaveLength(0);
    });
  });

  describe('resolveMultiMonthDropDays', () => {
    it('matches resolveDefaultDropDays called per month individually', () => {
      const rows = buildAllocationStudioRows({
        projects: [],
        resourceTypes: [baseResourceType],
        resources: [baseResource],
        demandSnapshots: [
          {
            id: '55555555-5555-5555-5555-555555555555',
            importBatchId: 'manual',
            projectCode: 'E0100',
            resourceTypeId: baseAllocation.resourceTypeId,
            year: 2026,
            month: 1,
            demandDays: 4,
            supplyDays: 0,
            origin: 'manual-adjustment',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        allocations: [{ ...baseAllocation, projectCode: 'E0100', month: 2, allocatedDays: 4 }],
        year: 2026,
        resourceTypeFilter: 'all',
        projectSearch: '',
      });
      const row = rows[0];

      expect(row).toBeDefined();
      if (!row) return;

      const entries = resolveMultiMonthDropDays(row, [1, 2, 3]);

      expect(entries).toEqual([
        { month: 1, allocatedDays: resolveDefaultDropDays(row.months[0]!) },
        { month: 2, allocatedDays: resolveDefaultDropDays(row.months[1]!) },
        { month: 3, allocatedDays: resolveDefaultDropDays(row.months[2]!) },
      ]);
      // month 1 has a 4-day gap; month 2 is fully covered by the existing
      // allocation (defaults to 1); month 3 has neither demand nor allocation.
      expect(entries).toEqual([
        { month: 1, allocatedDays: 4 },
        { month: 2, allocatedDays: 1 },
        { month: 3, allocatedDays: 1 },
      ]);
    });
  });

  describe('applyAllocationChangeBatch', () => {
    it('creates one allocation per entry from an empty array', () => {
      const result = applyAllocationChangeBatch([], {
        resourceId: baseAllocation.resourceId,
        projectCode: 'E0100',
        resourceTypeId: baseAllocation.resourceTypeId,
        year: 2026,
        origin: 'drag-and-drop',
        entries: [
          { month: 1, allocatedDays: 3 },
          { month: 2, allocatedDays: 5 },
        ],
      });

      expect(result).toHaveLength(2);
      expect(result.find((item) => item.month === 1)?.allocatedDays).toBe(3);
      expect(result.find((item) => item.month === 2)?.allocatedDays).toBe(5);
      expect(result.every((item) => item.origin === 'drag-and-drop')).toBe(true);
    });

    it('adds on top of an existing allocation for an overlapping month, and does not mutate the input', () => {
      const input = [baseAllocation];
      const result = applyAllocationChangeBatch(input, {
        resourceId: baseAllocation.resourceId,
        projectCode: baseAllocation.projectCode,
        resourceTypeId: baseAllocation.resourceTypeId,
        year: baseAllocation.year,
        origin: 'drag-and-drop',
        entries: [{ month: baseAllocation.month, allocatedDays: 2 }],
      });

      expect(result.find((item) => item.month === baseAllocation.month)?.allocatedDays).toBe(6);
      expect(input).toEqual([baseAllocation]);
    });
  });

  describe('buildBatchSimulationPreview', () => {
    it('computes independent before/after coverage per month', () => {
      const batch = {
        resourceId: baseAllocation.resourceId,
        projectCode: 'E0100',
        resourceTypeId: baseAllocation.resourceTypeId,
        year: 2026,
        origin: 'drag-and-drop' as const,
        entries: [
          { month: 1, allocatedDays: 3 },
          { month: 2, allocatedDays: 2 },
        ],
      };
      const currentAllocations: (typeof baseAllocation)[] = [];
      const simulatedAllocations = applyAllocationChangeBatch(currentAllocations, batch);
      const demandSnapshots = [
        {
          id: '55555555-5555-5555-5555-555555555555',
          importBatchId: 'manual',
          projectCode: 'E0100',
          resourceTypeId: baseAllocation.resourceTypeId,
          year: 2026,
          month: 1,
          demandDays: 5,
          supplyDays: 0,
          origin: 'manual-adjustment' as const,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ];

      const entries = buildBatchSimulationPreview({
        currentAllocations,
        simulatedAllocations,
        batch,
        demandSnapshots,
      });

      expect(entries).toHaveLength(2);
      expect(entries[0]?.beforeDemandSummary.remainingDemandDays).toBe(5);
      expect(entries[0]?.afterDemandSummary.remainingDemandDays).toBe(2);
      expect(entries[1]?.beforeDemandSummary.demandDays).toBe(0);
      expect(entries[1]?.afterDemandSummary.allocatedDays).toBe(2);
    });
  });
});
