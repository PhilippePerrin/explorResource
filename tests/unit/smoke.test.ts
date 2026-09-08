import { describe, it, expect } from 'vitest';

// Smoke test: confirms the Vitest + TypeScript toolchain is wired correctly.
// Real domain calculation tests are added in Lot 3 (src/domain/calculations).
describe('toolchain smoke test', () => {
  it('runs basic arithmetic', () => {
    expect(1 + 1).toBe(2);
  });
});
