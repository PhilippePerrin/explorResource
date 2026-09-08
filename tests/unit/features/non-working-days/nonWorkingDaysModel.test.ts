import { describe, expect, it, vi } from 'vitest';

import {
  applyClipboardGrid,
  calculateNonWorkingDayTotals,
  createNonWorkingDayMutationPlan,
  parseClipboardGrid,
} from '@/features/non-working-days';

describe('non-working days model', () => {
  it('parses tab/newline clipboard content into a grid', () => {
    expect(parseClipboardGrid('1\t2,5\r\n3\t4')).toEqual([
      ['1', '2,5'],
      ['3', '4'],
    ]);
  });

  it('applies clipboard values starting from the targeted cell', () => {
    const rows = applyClipboardGrid(
      [
        {
          resourceId: 'resource-1',
          resourceName: 'Alice Doe',
          resourceStatus: 'active',
          values: Array.from({ length: 12 }, () => 0),
        },
        {
          resourceId: 'resource-2',
          resourceName: 'Bob Doe',
          resourceStatus: 'active',
          values: Array.from({ length: 12 }, () => 0),
        },
      ],
      0,
      1,
      [
        ['1', '2,5'],
        ['3', '4'],
      ],
    );

    expect(rows[0]?.values.slice(1, 3)).toEqual([1, 2.5]);
    expect(rows[1]?.values.slice(1, 3)).toEqual([3, 4]);
  });

  it('computes row, column and grand totals', () => {
    const totals = calculateNonWorkingDayTotals([
      {
        resourceId: 'resource-1',
        resourceName: 'Alice Doe',
        resourceStatus: 'active',
        values: [1, 2, ...Array.from({ length: 10 }, () => 0)],
      },
      {
        resourceId: 'resource-2',
        resourceName: 'Bob Doe',
        resourceStatus: 'active',
        values: [0.5, 1, ...Array.from({ length: 10 }, () => 0)],
      },
    ]);

    expect(totals.rowTotals['resource-1']).toBe(3);
    expect(totals.columnTotals[0]).toBe(1.5);
    expect(totals.grandTotal).toBe(4.5);
  });

  it('creates upserts for non-zero values and deletes for cleared cells', () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      '55f93c16-ac11-493f-b60f-8d31bc2f4f92',
    );

    const plan = createNonWorkingDayMutationPlan(
      2026,
      [
        {
          resourceId: 'resource-1',
          resourceName: 'Alice Doe',
          resourceStatus: 'active',
          values: [1, 0, ...Array.from({ length: 10 }, () => 0)],
        },
      ],
      [
        {
          id: '8f6b6ef2-f6a1-4313-b17c-72dd6e5195f2',
          resourceId: 'resource-1',
          year: 2026,
          month: 2,
          days: 3,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      '2026-09-08T12:00:00.000Z',
    );

    expect(plan.upserts[0]?.id).toBe('55f93c16-ac11-493f-b60f-8d31bc2f4f92');
    expect(plan.deletes).toEqual(['8f6b6ef2-f6a1-4313-b17c-72dd6e5195f2']);
    vi.restoreAllMocks();
  });
});
