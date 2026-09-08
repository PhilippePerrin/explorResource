import { describe, expect, it } from 'vitest';

import {
  buildProjectCodeMigrationPlan,
  countProjectReferences,
  createProjectFormSchema,
} from '@/features/projects';

describe('project utilities', () => {
  it('counts references across demand snapshots and allocations', () => {
    expect(
      countProjectReferences(
        {
          demandSnapshots: [{ projectCode: 'E0100' }, { projectCode: 'E0100' }],
          allocations: [{ projectCode: 'P0001' }, { projectCode: 'E0100' }],
        },
        'e0100',
      ),
    ).toBe(3);
  });

  it('rejects duplicate project codes case-insensitively', () => {
    const schema = createProjectFormSchema([
      {
        id: 'd16c2fdc-c6c9-42f8-a436-f24376eaec62',
        code: 'E0100',
        name: 'Commercial Analytics',
        status: 'active',
        createdAt: '2026-09-08T08:00:00.000Z',
        updatedAt: '2026-09-08T08:00:00.000Z',
      },
    ]);

    const result = schema.safeParse({
      code: 'e0100',
      name: 'Another name',
      status: 'active',
      releaseIds: [],
    });

    expect(result.success).toBe(false);
  });

  it('builds a migration plan when a project code changes', () => {
    const plan = buildProjectCodeMigrationPlan(
      { code: 'E0100' },
      'E0101',
      {
        demandSnapshots: [
          {
            id: 'e365e8fc-dd08-4cc8-9f4c-ff3676b50265',
            importBatchId: 'manual',
            projectCode: 'E0100',
            resourceTypeId: 'a6d03841-fb1f-4be5-b749-511ba3a36168',
            year: 2026,
            month: 1,
            demandDays: 10,
            supplyDays: 5,
            origin: 'manual-adjustment',
            createdAt: '2026-09-08T08:00:00.000Z',
            updatedAt: '2026-09-08T08:00:00.000Z',
          },
        ],
        allocations: [
          {
            id: 'ad6bd46a-b537-4d54-8f69-4eaac45f5e8e',
            resourceId: '1817bad8-4c23-4b3d-a1d2-e61ddcb75103',
            projectCode: 'E0100',
            resourceTypeId: 'a6d03841-fb1f-4be5-b749-511ba3a36168',
            year: 2026,
            month: 1,
            allocatedDays: 5,
            origin: 'manual',
            createdAt: '2026-09-08T08:00:00.000Z',
            updatedAt: '2026-09-08T08:00:00.000Z',
          },
        ],
      },
      '2026-09-08T12:00:00.000Z',
    );

    expect(plan.demandSnapshots[0]?.projectCode).toBe('E0101');
    expect(plan.allocations[0]?.projectCode).toBe('E0101');
    expect(plan.allocations[0]?.updatedAt).toBe('2026-09-08T12:00:00.000Z');
  });
});
