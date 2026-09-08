import { test, expect } from '@playwright/test';

// First-launch smoke test (acceptance scenario #1 from docs/functional-specification.md).
// Expanded with the full 20-scenario E2E suite across later lots.
test('first launch shows the application shell', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: /Primary/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Dashboard$/i })).toBeVisible();
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

test('keyboard navigation reaches the primary nav and first page control', async ({ page }) => {
  await page.goto('/');

  await page.keyboard.press('Tab');
  await expect(page.getByText(/Skip to main content/i)).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: /^Dashboard$/i })).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: /^Capacity Command Center$/i })).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/capacity$/);
  await expect(page.getByRole('heading', { name: /^Capacity Command Center$/i })).toBeVisible();

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (
      await page
        .locator('#filter-searchTerm')
        .evaluate((element) => element === document.activeElement)
    ) {
      break;
    }

    await page.keyboard.press('Tab');
  }

  await expect(page.locator('#filter-searchTerm')).toBeFocused();
});
