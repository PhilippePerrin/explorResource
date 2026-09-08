import { test, expect } from '@playwright/test';

// First-launch smoke test (acceptance scenario #1 from docs/functional-specification.md).
// Expanded with the full 20-scenario E2E suite across later lots.
test('first launch shows the application shell', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: /Resource Capacity & Project Demand Planner/i }),
  ).toBeVisible();
});

test('first launch uses the GitHub Pages base path and registers the scoped PWA shell', async ({
  page,
}) => {
  await page.goto('/');

  await expect(page).toHaveURL(/\/explorResource\/#?$/);

  const manifestHref = await page
    .locator('link[rel="manifest"]')
    .evaluate((element) => element.getAttribute('href'));
  expect(manifestHref).toBe('/explorResource/manifest.webmanifest');

  const serviceWorkerScope = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) {
      return null;
    }

    const registration = await navigator.serviceWorker.ready;
    return registration.scope;
  });

  expect(serviceWorkerScope).toContain('/explorResource/');
});
