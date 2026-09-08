import { describe, expect, it } from 'vitest';

import {
  buildAllocationDemandStatus,
  createAllocationFormSchema,
  findLatestDemandSnapshot,
} from '@/features/resources';

describe('allocation utilities', () => {
  it('rejects incompatible resource types', () => {
    const schema = createAllocationFormSchema(
      {
        resourceTypeId: '02fcbcb8-f93f-41cb-a1b6-3f44054ddbd3',
      },
      [
        {
          id: '02fcbcb8-f93f-41cb-a1b6-3f44054ddbd3',
          label: 'Developer',
          shortCode: 'DEV',
          color: '#00427f',
          status: 'active',
          displayOrder: 1,
          createdAt: '2026-09-08T08:00:00.000Z',
          updatedAt: '2026-09-08T08:00:00.000Z',
        },
        {
          id: '42a0afaa-7a8c-46c4-b972-7568696c42dd',
          label: 'Analyst',
          shortCode: 'ANA',
          color: '#005c4f',
          status: 'active',
          displayOrder: 2,
          createdAt: '2026-09-08T08:00:00.000Z',
          updatedAt: '2026-09-08T08:00:00.000Z',
        },
      ],
      [
        {
          id: '6dc347d8-bb5d-4cf4-9cf5-c993913c65f8',
          code: 'E0100',
          name: 'Commercial Analytics',
          status: 'active',
          createdAt: '2026-09-08T08:00:00.000Z',
          updatedAt: '2026-09-08T08:00:00.000Z',
        },
      ],
    );

    const result = schema.safeParse({
      projectCode: 'E0100',
      resourceTypeId: '42a0afaa-7a8c-46c4-b972-7568696c42dd',
      year: 2026,
      month: 1,
      allocatedDays: 3,
      origin: 'manual',
    });

    expect(result.success).toBe(false);
  });

  it('selects the latest matching demand snapshot', () => {
    const snapshot = findLatestDemandSnapshot(
      [
        {
          id: 'f1cb09af-2172-4d84-9df3-b1ce07c15be7',
          importBatchId: 'manual',
          projectCode: 'E0100',
          resourceTypeId: '02fcbcb8-f93f-41cb-a1b6-3f44054ddbd3',
          year: 2026,
          month: 1,
          demandDays: 4,
          supplyDays: 0,
          origin: 'manual-adjustment',
          createdAt: '2026-09-08T08:00:00.000Z',
          updatedAt: '2026-09-08T08:00:00.000Z',
        },
        {
          id: '1a635bb8-ec97-48bc-9299-e3f2ebd35cca',
          importBatchId: 'manual',
          projectCode: 'E0100',
          resourceTypeId: '02fcbcb8-f93f-41cb-a1b6-3f44054ddbd3',
          year: 2026,
          month: 1,
          demandDays: 6,
          supplyDays: 0,
          origin: 'manual-adjustment',
          createdAt: '2026-09-08T08:00:00.000Z',
          updatedAt: '2026-09-08T09:00:00.000Z',
        },
      ],
      {
        projectCode: 'E0100',
        resourceTypeId: '02fcbcb8-f93f-41cb-a1b6-3f44054ddbd3',
        year: 2026,
        month: 1,
      },
    );

    expect(snapshot?.demandDays).toBe(6);
  });

  it('flags over-service when the allocation exceeds remaining demand', () => {
    const status = buildAllocationDemandStatus({
      allocation: {
        id: 'd133f65a-1a66-48da-bd65-595bf29cc1cd',
        projectCode: 'E0100',
        resourceTypeId: '02fcbcb8-f93f-41cb-a1b6-3f44054ddbd3',
        year: 2026,
        month: 1,
        allocatedDays: 3,
      },
      allAllocations: [
        {
          id: 'existing-allocation',
          resourceId: 'resource-1',
          projectCode: 'E0100',
          resourceTypeId: '02fcbcb8-f93f-41cb-a1b6-3f44054ddbd3',
          year: 2026,
          month: 1,
          allocatedDays: 4,
          origin: 'manual',
          createdAt: '2026-09-08T08:00:00.000Z',
          updatedAt: '2026-09-08T08:00:00.000Z',
        },
      ],
      demandSnapshots: [
        {
          id: 'f1cb09af-2172-4d84-9df3-b1ce07c15be7',
          importBatchId: 'manual',
          projectCode: 'E0100',
          resourceTypeId: '02fcbcb8-f93f-41cb-a1b6-3f44054ddbd3',
          year: 2026,
          month: 1,
          demandDays: 5,
          supplyDays: 0,
          origin: 'manual-adjustment',
          createdAt: '2026-09-08T08:00:00.000Z',
          updatedAt: '2026-09-08T08:00:00.000Z',
        },
      ],
    });

    expect(status.isOverService).toBe(true);
    expect(status.overServiceDays).toBe(2);
    expect(status.remainingDemandBeforeAllocationDays).toBe(1);
  });
});
