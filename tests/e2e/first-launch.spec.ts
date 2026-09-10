import { test, expect } from '@playwright/test';

import {
  E2E_DEMAND_SNAPSHOT,
  E2E_PROJECT,
  E2E_RESOURCE,
  E2E_RESOURCE_TYPE,
  E2E_WORKING_DAYS,
  openPrimaryPage,
  setupAppWithSeed,
  TEST_YEAR,
} from './helpers';

// First-launch smoke test (acceptance scenario #1 from docs/functional-specification.md).
// Expanded with the full 20-scenario E2E suite across later lots.
test('first launch shows the application shell', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: /Primary/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Dashboard$/i })).toBeVisible();
});

test('first launch uses the root base path and registers the scoped PWA shell', async ({
  page,
}) => {
  await page.goto('/');

  await expect(page).toHaveURL(/\/#?$/);

  const manifestHref = await page
    .locator('link[rel="manifest"]')
    .evaluate((element) => element.getAttribute('href'));
  expect(manifestHref).toBe('/manifest.webmanifest');

  const serviceWorkerScope = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) {
      return null;
    }

    const registration = await navigator.serviceWorker.ready;
    return registration.scope;
  });

  expect(serviceWorkerScope).toContain(new URL('/', page.url()).href);
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

test('settings page shows the default threshold and precision initialization', async ({ page }) => {
  await page.goto('/');
  await openPrimaryPage(page, /^Settings$/i, /^Settings$/i);

  await expect(page.locator('#available-below')).toHaveValue('80');
  await expect(page.locator('#used-up-to')).toHaveValue('100');
  await expect(page.locator('#overload-up-to')).toHaveValue('110');
  await expect(page.locator('#critical-above')).toHaveValue('110');
  await expect(page.getByText(/1 decimal place/i)).toBeVisible();
  await expect(page.getByText(/1e-6/i)).toBeVisible();
});

test('app shell remains available offline after the initial cached visit', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /^Dashboard$/i })).toBeVisible();

  await page.evaluate(async () => {
    if ('serviceWorker' in navigator) {
      await navigator.serviceWorker.ready;
    }
  });

  await context.setOffline(true);
  await page.reload();

  await expect(page.getByRole('navigation', { name: /Primary/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Dashboard$/i })).toBeVisible();
});

test('keyboard-only navigation reaches Allocation Studio and saves without drag-and-drop', async ({
  page,
}) => {
  await setupAppWithSeed(page, {
    projects: [E2E_PROJECT],
    resourceTypes: [E2E_RESOURCE_TYPE],
    resources: [E2E_RESOURCE],
    workingDaysCalendars: [E2E_WORKING_DAYS],
    demandSnapshots: [E2E_DEMAND_SNAPSHOT],
  });

  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: /^Allocation Studio$/i })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: /^Allocation Studio$/i })).toBeVisible();

  await page.getByRole('button', { name: /^Add allocation/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: /Add allocation/i })).toBeVisible();

  await page.locator('#studio-resource').focus();
  await page.keyboard.press('ArrowDown');
  await page.locator('#studio-project').focus();
  await page.keyboard.press('ArrowDown');
  await page.locator('#studio-form-type').focus();
  await page.keyboard.press('ArrowDown');
  await page.locator('#studio-form-year').focus();
  await page.keyboard.press('Control+A');
  await page.keyboard.type(String(TEST_YEAR));
  await page.locator('#studio-form-month').focus();
  await page.keyboard.press('Home');
  await page.locator('#studio-form-days').focus();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('2');
  await page.getByRole('button', { name: /Queue change/i }).focus();
  await page.keyboard.press('Enter');
  await expect(
    page.locator('p[role="status"]').filter({ hasText: /Draft allocation queued/i }),
  ).toContainText(/Draft allocation queued/i);
  await page.getByRole('button', { name: /Save draft/i }).focus();
  await page.keyboard.press('Enter');

  await expect(
    page.locator('p[role="status"]').filter({ hasText: /Allocation draft saved/i }),
  ).toContainText(/Allocation draft saved/i);
  await expect(page.getByText(/Covered 2 d/i)).toBeVisible();
});
