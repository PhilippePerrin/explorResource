import { describe, expect, it } from 'vitest';

import {
  countResourceTypeReferences,
  createResourceTypeFormSchema,
} from '@/features/resource-types';

describe('resource type utilities', () => {
  it('counts references across resources, demand snapshots and allocations', () => {
    expect(
      countResourceTypeReferences(
        {
          resources: [{ resourceTypeId: 'rt-1' }, { resourceTypeId: 'rt-2' }],
          demandSnapshots: [{ resourceTypeId: 'rt-1' }, { resourceTypeId: 'rt-1' }],
          allocations: [{ resourceTypeId: 'rt-2' }, { resourceTypeId: 'rt-1' }],
        },
        'rt-1',
      ),
    ).toBe(4);
  });

  it('rejects duplicate labels case-insensitively', () => {
    const schema = createResourceTypeFormSchema([
      {
        id: '1f760ff5-0e66-4a48-b188-f234451e28f7',
        label: 'Developer',
        shortCode: 'DEV',
        color: '#00427f',
        status: 'active',
        displayOrder: 1,
        createdAt: '2026-09-08T08:00:00.000Z',
        updatedAt: '2026-09-08T08:00:00.000Z',
      },
    ]);

    const result = schema.safeParse({
      label: 'developer',
      shortCode: 'DEV2',
      color: '#81b444',
      displayOrder: 2,
    });

    expect(result.success).toBe(false);
  });
});
