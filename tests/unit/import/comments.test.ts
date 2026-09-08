import { describe, expect, it } from 'vitest';

import { parseDemandSupplyComment } from '@/import';

describe('parseDemandSupplyComment', () => {
  it('extracts day values from the PSA comment text', () => {
    expect(
      parseDemandSupplyComment('Demand : 12.5 (Day) / 0.6 (FTE)\nSupply : 8.0 (Day) / 0.4 (FTE)'),
    ).toEqual({
      demandDays: 12.5,
      supplyDays: 8,
    });
  });

  it('returns null when the comment is missing or malformed', () => {
    expect(parseDemandSupplyComment(undefined)).toBeNull();
    expect(parseDemandSupplyComment('Demand only')).toBeNull();
  });
});
