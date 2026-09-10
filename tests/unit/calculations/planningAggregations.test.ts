import { describe, expect, it } from 'vitest';

import { buildCoverageBarSegments, buildDemandAllocationSummary } from '@/domain/calculations';

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
