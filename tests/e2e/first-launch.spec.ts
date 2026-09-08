import { test, expect } from '@playwright/test';

// First-launch smoke test (acceptance scenario #1 from docs/functional-specification.md).
// Expanded with the full 20-scenario E2E suite across later lots.
test('first launch shows the application shell', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: /Resource Capacity & Project Demand Planner/i }),
  ).toBeVisible();
});
