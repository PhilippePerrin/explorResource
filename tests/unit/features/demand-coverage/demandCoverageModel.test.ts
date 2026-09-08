import { describe, expect, it } from 'vitest';

import { buildDemandCoverageRows } from '@/features/demand-coverage';

describe('demandCoverageModel', () => {
  it('keeps covered, uncovered, and over-service values separate', () => {
    const rows = buildDemandCoverageRows({
      projects: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          code: 'E0100',
          name: 'Commercial Analytics',
          status: 'active',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      resourceTypes: [
        {
          id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          label: 'Developer',
          shortCode: 'DEV',
          color: '#00427f',
          status: 'active',
          displayOrder: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      demandSnapshots: [
        {
          id: '22222222-2222-2222-2222-222222222222',
          importBatchId: 'manual',
          projectCode: 'E0100',
          resourceTypeId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          year: 2026,
          month: 3,
          demandDays: 5,
          supplyDays: 0,
          origin: 'manual-adjustment',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: '33333333-3333-3333-3333-333333333333',
          importBatchId: 'manual',
          projectCode: 'E0100',
          resourceTypeId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          year: 2026,
          month: 4,
          demandDays: 2,
          supplyDays: 0,
          origin: 'manual-adjustment',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      allocations: [
        {
          id: '44444444-4444-4444-4444-444444444444',
          resourceId: '55555555-5555-5555-5555-555555555555',
          projectCode: 'E0100',
          resourceTypeId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          year: 2026,
          month: 3,
          allocatedDays: 3,
          origin: 'manual',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: '66666666-6666-6666-6666-666666666666',
          resourceId: '77777777-7777-7777-7777-777777777777',
          projectCode: 'E0100',
          resourceTypeId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          year: 2026,
          month: 4,
          allocatedDays: 4,
          origin: 'manual',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      year: 2026,
      projectSearch: '',
      resourceTypeFilter: 'all',
      showOnlyGaps: false,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.totalDemandDays).toBe(7);
    expect(rows[0]?.totalAllocatedDays).toBe(7);
    expect(rows[0]?.totalRemainingDemandDays).toBe(2);
    expect(rows[0]?.totalOverServiceDays).toBe(2);
    expect(rows[0]?.months[2]).toMatchObject({
      demandDays: 5,
      allocatedDays: 3,
      remainingDemandDays: 2,
      overServiceDays: 0,
    });
    expect(rows[0]?.months[3]).toMatchObject({
      demandDays: 2,
      allocatedDays: 4,
      remainingDemandDays: 0,
      overServiceDays: 2,
    });
  });
});
