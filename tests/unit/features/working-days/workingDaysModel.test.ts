import { describe, expect, it, vi } from 'vitest';

import {
  calculateWorkingDaysTotal,
  createWorkingDaysMutationPayload,
  duplicateWorkingDaysToNextYear,
} from '@/features/working-days';

describe('working days model', () => {
  it('computes the annual total from 12 months', () => {
    expect(calculateWorkingDaysTotal([20, 20, 21, 21, 19, 20, 23, 22, 21, 23, 20, 19])).toBe(249);
  });

  it('reuses existing ids when generating yearly mutation payloads', () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      '67d0a1ea-47dd-4d92-8909-6f590a8d9c63',
    );

    const payload = createWorkingDaysMutationPayload(
      {
        year: 2026,
        months: Array.from({ length: 12 }, () => 20),
      },
      [
        {
          id: '94df2a25-9bcc-4182-bdef-9601ef2bc40e',
          year: 2026,
          month: 1,
          workingDaysCount: 18,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      '2026-09-08T12:00:00.000Z',
    );

    expect(payload[0]?.id).toBe('94df2a25-9bcc-4182-bdef-9601ef2bc40e');
    expect(payload[1]?.id).toBe('67d0a1ea-47dd-4d92-8909-6f590a8d9c63');
    vi.restoreAllMocks();
  });

  it('duplicates one year into the next', () => {
    const payload = duplicateWorkingDaysToNextYear(
      {
        year: 2026,
        months: Array.from({ length: 12 }, (_, index) => 18 + index),
      },
      2027,
      [],
      '2026-09-08T12:00:00.000Z',
    );

    expect(payload).toHaveLength(12);
    expect(payload[0]?.year).toBe(2027);
    expect(payload[11]?.workingDaysCount).toBe(29);
  });
});
