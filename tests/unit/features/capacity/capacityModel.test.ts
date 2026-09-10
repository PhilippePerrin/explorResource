import { describe, expect, it } from 'vitest';

import { buildCapacityRows, getFocusMonths } from '@/features/capacity';

describe('capacityModel', () => {
  it('filters resources and resolves quarter focus months', () => {
    const rows = buildCapacityRows({
      resources: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          firstName: 'Alice',
          lastName: 'Martin',
          resourceTypeId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          collaborationType: 'internal',
          status: 'active',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: '22222222-2222-2222-2222-222222222222',
          firstName: 'Bob',
          lastName: 'Durand',
          resourceTypeId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          collaborationType: 'internal',
          status: 'archived',
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
        {
          id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          label: 'Analyst',
          shortCode: 'ANA',
          color: '#00427f',
          status: 'active',
          displayOrder: 2,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      allocations: [],
      workingDaysCalendars: [
        {
          id: '33333333-3333-3333-3333-333333333333',
          year: 2026,
          month: 1,
          workingDaysCount: 20,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      resourceNonWorkingDays: [],
      appSettings: null,
      year: 2026,
      searchTerm: 'alice',
      resourceTypeFilter: 'all',
      companyFilter: 'all',
      statusFilter: 'active',
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.resourceName).toBe('Alice Martin');
    expect(rows[0]?.resourceTypeLabel).toBe('DEV');
    expect(rows[0]?.resourceTypeFullLabel).toBe('Developer');
    expect(getFocusMonths('q2')).toEqual([4, 5, 6]);
  });
});
