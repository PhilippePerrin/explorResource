import { describe, expect, it } from 'vitest';

import { normalizeAmount } from '@/domain/normalization/normalizeAmount';

describe('normalizeAmount', () => {
  it('normalizes tiny floating point noise to zero', () => {
    expect(normalizeAmount(-4.4408920985006262e-16)).toBe(0);
  });

  it('keeps meaningful decimal values unchanged', () => {
    expect(normalizeAmount(0.16986301369862999)).toBe(0.16986301369862999);
  });
});
