import { describe, expect, it } from 'vitest';

import {
  buildCoverageBarSegments,
  buildDemandAllocationSummary,
  buildResourceMonthSummary,
  buildResourcePeriodSummary,
} from '@/domain/calculations';

const periodResource = {
  id: 'r1',
  firstName: 'Alice',
  lastName: 'Martin',
  resourceTypeId: 'type-1',
  collaborationType: 'internal' as const,
  status: 'active' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('buildCoverageBarSegments', () => {
  it('returns a covered + gap split for partial coverage', () => {
    const summary = buildDemandAllocationSummary({
      demandSnapshot: {
        projectCode: 'E0100',
        resourceTypeId: 'type-1',
        year: 2026,
        month: 1,
        demandDays: 5,
      },
      allocations: [
        {
          id: '1',
          resourceId: 'r1',
          projectCode: 'E0100',
          resourceTypeId: 'type-1',
          year: 2026,
          month: 1,
          allocatedDays: 3,
          origin: 'manual',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    expect(buildCoverageBarSegments(summary)).toEqual([
      { kind: 'covered', widthPercent: 60 },
      { kind: 'gap', widthPercent: 40 },
    ]);
  });

  it('returns a covered + over-service split when allocation exceeds demand', () => {
    const summary = buildDemandAllocationSummary({
      demandSnapshot: {
        projectCode: 'E0100',
        resourceTypeId: 'type-1',
        year: 2026,
        month: 1,
        demandDays: 5,
      },
      allocations: [
        {
          id: '1',
          resourceId: 'r1',
          projectCode: 'E0100',
          resourceTypeId: 'type-1',
          year: 2026,
          month: 1,
          allocatedDays: 8,
          origin: 'manual',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    expect(summary.overServiceDays).toBe(3);
    expect(summary.remainingDemandDays).toBe(0);
    expect(buildCoverageBarSegments(summary)).toEqual([
      { kind: 'covered', widthPercent: 62.5 },
      { kind: 'over-service', widthPercent: 37.5 },
    ]);
  });

  it('returns an empty segment list when there is neither demand nor allocation', () => {
    const summary = buildDemandAllocationSummary({
      demandSnapshot: {
        projectCode: 'E0100',
        resourceTypeId: 'type-1',
        year: 2026,
        month: 1,
        demandDays: 0,
      },
      allocations: [],
    });

    expect(buildCoverageBarSegments(summary)).toEqual([]);
  });

  it('returns a single fully-covered segment when allocation exactly matches demand', () => {
    const summary = buildDemandAllocationSummary({
      demandSnapshot: {
        projectCode: 'E0100',
        resourceTypeId: 'type-1',
        year: 2026,
        month: 1,
        demandDays: 4,
      },
      allocations: [
        {
          id: '1',
          resourceId: 'r1',
          projectCode: 'E0100',
          resourceTypeId: 'type-1',
          year: 2026,
          month: 1,
          allocatedDays: 4,
          origin: 'manual',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    expect(buildCoverageBarSegments(summary)).toEqual([{ kind: 'covered', widthPercent: 100 }]);
  });

  it('never produces a negative segment width across a range of demand/allocation pairs', () => {
    const pairs: Array<[number, number]> = [
      [0, 0],
      [0, 5],
      [5, 0],
      [5, 5],
      [5, 3],
      [3, 5],
      [10, 12.5],
      [12.5, 10],
    ];

    for (const [demandDays, allocatedDays] of pairs) {
      const summary = buildDemandAllocationSummary({
        demandSnapshot: {
          projectCode: 'E0100',
          resourceTypeId: 'type-1',
          year: 2026,
          month: 1,
          demandDays,
        },
        allocations:
          allocatedDays === 0
            ? []
            : [
                {
                  id: '1',
                  resourceId: 'r1',
                  projectCode: 'E0100',
                  resourceTypeId: 'type-1',
                  year: 2026,
                  month: 1,
                  allocatedDays,
                  origin: 'manual',
                  createdAt: '2026-01-01T00:00:00.000Z',
                  updatedAt: '2026-01-01T00:00:00.000Z',
                },
              ],
      });
      const segments = buildCoverageBarSegments(summary);

      for (const segment of segments) {
        expect(segment.widthPercent).toBeGreaterThanOrEqual(0);
      }

      const total = segments.reduce((sum, segment) => sum + segment.widthPercent, 0);
      expect(total).toBeLessThanOrEqual(100.0001);
    }
  });
});

describe('buildResourcePeriodSummary', () => {
  const workingDaysCalendars = [
    { id: 'wd-1', year: 2026, month: 1, workingDaysCount: 5, createdAt: '', updatedAt: '' },
    { id: 'wd-2', year: 2026, month: 2, workingDaysCount: 20, createdAt: '', updatedAt: '' },
  ];
  const allocations = [
    {
      id: 'a-1',
      resourceId: 'r1',
      projectCode: 'E0100',
      resourceTypeId: 'type-1',
      year: 2026,
      month: 1,
      allocatedDays: 10,
      origin: 'manual' as const,
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'a-2',
      resourceId: 'r1',
      projectCode: 'E0100',
      resourceTypeId: 'type-1',
      year: 2026,
      month: 2,
      allocatedDays: 4,
      origin: 'manual' as const,
      createdAt: '',
      updatedAt: '',
    },
  ];

  it('matches a single buildResourceMonthSummary call when given one month', () => {
    const { year: _year, month: _month, ...monthSummary } = buildResourceMonthSummary({
      resource: periodResource,
      year: 2026,
      month: 1,
      workingDaysCalendars,
      resourceNonWorkingDays: [],
      allocations,
    });
    const periodSummary = buildResourcePeriodSummary({
      resource: periodResource,
      year: 2026,
      months: [1],
      workingDaysCalendars,
      resourceNonWorkingDays: [],
      allocations,
    });

    expect(periodSummary).toEqual({ ...monthSummary, months: [1] });
  });

  it('sums capacity/load across months and recomputes utilization from the totals, not an average of monthly rates', () => {
    const periodSummary = buildResourcePeriodSummary({
      resource: periodResource,
      year: 2026,
      months: [1, 2],
      workingDaysCalendars,
      resourceNonWorkingDays: [],
      allocations,
    });

    // Month 1: 10/5 = 200%. Month 2: 4/20 = 20%. Averaging those rates would
    // give 110%, but the correct period rate is the summed load over the
    // summed capacity: (10 + 4) / (5 + 20) * 100 = 56%.
    expect(periodSummary.netCapacityDays).toBe(25);
    expect(periodSummary.assignedLoadDays).toBe(14);
    expect(periodSummary.availableCapacityDays).toBe(11);
    expect(periodSummary.utilization.ratePercent).toBe(56);
  });

  it('reports workingDaysConfigured true when at least one month in the range has a calendar entry', () => {
    const periodSummary = buildResourcePeriodSummary({
      resource: periodResource,
      year: 2026,
      months: [1, 3],
      workingDaysCalendars,
      resourceNonWorkingDays: [],
      allocations: [],
    });

    expect(periodSummary.workingDaysConfigured).toBe(true);
  });

  it('reports workingDaysConfigured false when no month in the range has a calendar entry', () => {
    const periodSummary = buildResourcePeriodSummary({
      resource: periodResource,
      year: 2026,
      months: [3, 4],
      workingDaysCalendars,
      resourceNonWorkingDays: [],
      allocations: [],
    });

    expect(periodSummary.workingDaysConfigured).toBe(false);
  });
});
