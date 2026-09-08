import { describe, expect, it } from 'vitest';

import {
  buildResourceMonthlySummary,
  countResourceReferences,
  createResourceFormSchema,
} from '@/features/resources';

describe('resource utilities', () => {
  it('counts references across allocations and non-working days', () => {
    expect(
      countResourceReferences(
        {
          allocations: [{ resourceId: 'resource-1' }, { resourceId: 'resource-1' }],
          nonWorkingDays: [{ resourceId: 'resource-1' }, { resourceId: 'resource-2' }],
        },
        'resource-1',
      ),
    ).toBe(3);
  });

  it('requires a company for external resources', () => {
    const schema = createResourceFormSchema(
      [
        {
          id: '4dcf3e18-4cf2-4565-a445-278417f986cb',
          label: 'Developer',
          shortCode: 'DEV',
          color: '#00427f',
          status: 'active',
          displayOrder: 1,
          createdAt: '2026-09-08T08:00:00.000Z',
          updatedAt: '2026-09-08T08:00:00.000Z',
        },
      ],
      [],
      [],
    );

    const result = schema.safeParse({
      firstName: 'Alice',
      lastName: 'Martin',
      resourceTypeId: '4dcf3e18-4cf2-4565-a445-278417f986cb',
      collaborationType: 'external',
      companyId: '',
      startDate: '',
      endDate: '',
      status: 'active',
    });

    expect(result.success).toBe(false);
  });

  it('prevents resource type changes when allocations already exist', () => {
    const schema = createResourceFormSchema(
      [
        {
          id: '4dcf3e18-4cf2-4565-a445-278417f986cb',
          label: 'Developer',
          shortCode: 'DEV',
          color: '#00427f',
          status: 'active',
          displayOrder: 1,
          createdAt: '2026-09-08T08:00:00.000Z',
          updatedAt: '2026-09-08T08:00:00.000Z',
        },
        {
          id: '4a7252f0-2159-4d57-b2d4-5f6f499c6a06',
          label: 'Analyst',
          shortCode: 'ANA',
          color: '#005c4f',
          status: 'active',
          displayOrder: 2,
          createdAt: '2026-09-08T08:00:00.000Z',
          updatedAt: '2026-09-08T08:00:00.000Z',
        },
      ],
      [],
      [{ resourceId: 'c99807d8-0cde-4d6b-a3b4-27c69da0d57e' }],
      {
        id: 'c99807d8-0cde-4d6b-a3b4-27c69da0d57e',
        resourceTypeId: '4dcf3e18-4cf2-4565-a445-278417f986cb',
      },
    );

    const result = schema.safeParse({
      firstName: 'Alice',
      lastName: 'Martin',
      resourceTypeId: '4a7252f0-2159-4d57-b2d4-5f6f499c6a06',
      collaborationType: 'internal',
      companyId: '',
      startDate: '',
      endDate: '',
      status: 'active',
    });

    expect(result.success).toBe(false);
  });

  it('computes the monthly resource summary from working days, absences, and allocations', () => {
    const summary = buildResourceMonthlySummary({
      resource: {
        id: 'c99807d8-0cde-4d6b-a3b4-27c69da0d57e',
        firstName: 'Alice',
        lastName: 'Martin',
        resourceTypeId: '4dcf3e18-4cf2-4565-a445-278417f986cb',
        collaborationType: 'internal',
        status: 'active',
        createdAt: '2026-09-08T08:00:00.000Z',
        updatedAt: '2026-09-08T08:00:00.000Z',
      },
      year: 2026,
      month: 2,
      workingDaysCalendars: [
        {
          id: '32849368-a545-4262-b951-fbb10f1d16c4',
          year: 2026,
          month: 2,
          workingDaysCount: 20,
          createdAt: '2026-09-08T08:00:00.000Z',
          updatedAt: '2026-09-08T08:00:00.000Z',
        },
      ],
      resourceNonWorkingDays: [
        {
          id: '1eff6b49-c550-4fcc-ac9f-125d73ac0b27',
          resourceId: 'c99807d8-0cde-4d6b-a3b4-27c69da0d57e',
          year: 2026,
          month: 2,
          days: 2.5,
          createdAt: '2026-09-08T08:00:00.000Z',
          updatedAt: '2026-09-08T08:00:00.000Z',
        },
      ],
      allocations: [
        {
          id: '403f3340-f2c5-4697-91f7-5777246353f9',
          resourceId: 'c99807d8-0cde-4d6b-a3b4-27c69da0d57e',
          projectCode: 'E0100',
          resourceTypeId: '4dcf3e18-4cf2-4565-a445-278417f986cb',
          year: 2026,
          month: 2,
          allocatedDays: 12.5,
          origin: 'manual',
          createdAt: '2026-09-08T08:00:00.000Z',
          updatedAt: '2026-09-08T08:00:00.000Z',
        },
      ],
    });

    expect(summary.grossCapacityDays).toBe(20);
    expect(summary.netCapacityDays).toBe(17.5);
    expect(summary.assignedLoadDays).toBe(12.5);
    expect(summary.availableCapacityDays).toBe(5);
    expect(summary.utilization.ratePercent).toBeCloseTo(71.4, 1);
  });
});
