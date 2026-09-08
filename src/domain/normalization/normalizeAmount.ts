export function normalizeAmount(value: number, epsilon = 1e-6): number {
  return Math.abs(value) < epsilon ? 0 : value;
}
