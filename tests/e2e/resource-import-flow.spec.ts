import { expect, test } from '@playwright/test';

import {
  analyzeSelectedImport,
  completeImport,
  gotoShell,
  moveImportWizardToValidation,
  openPrimaryPage,
  uploadRealImport,
  uploadRealResourceImport,
} from './helpers';

test.describe.configure({ mode: 'serial' });
test.setTimeout(240_000);

test('bulk resource import unblocks the demand import end to end', async ({ page }) => {
  await gotoShell(page);

  await openPrimaryPage(page, /^Import resources$/i, /^Import resources$/i);
  await uploadRealResourceImport(page.locator('#resource-import-file-input'));
  await page.getByRole('button', { name: /Start technical analysis/i }).click();
  await expect(
    page.locator('p[role="status"]').filter({ hasText: /Technical analysis completed/i }),
  ).toBeVisible({ timeout: 120_000 });

  await expect(page.getByRole('heading', { name: /2\. Preview/i })).toBeVisible();
  await expect(page.getByText('New resource types', { exact: true })).toBeVisible();
  await expect(page.getByText('23')).toBeVisible();

  await page.getByRole('button', { name: /Next step/i }).click();
  await expect(page.getByRole('heading', { name: /3\. Anomaly review/i })).toBeVisible();
  await expect(page.getByText(/No anomalies detected\./i)).toBeVisible();

  await page.getByRole('button', { name: /Next step/i }).click();
  await expect(page.getByRole('heading', { name: /4\. Commit/i })).toBeVisible();
  await page.getByRole('button', { name: /Commit resource import/i }).click();

  await expect(page.getByRole('heading', { name: /5\. Final report/i })).toBeVisible();
  await expect(
    page.getByText(/Resource import committed successfully\. Download the Markdown report/i),
  ).toBeVisible({ timeout: 120_000 });

  const resourceImportHistory = page.locator('section').filter({
    has: page.getByRole('heading', { name: /Resource import history/i }),
  });
  await expect(resourceImportHistory.getByText(/export-resource\.xlsx/i)).toBeVisible();

  await openPrimaryPage(page, /^Resources$/i, /^Resources$/i);
  await expect(page.getByText(/Zakaria/i).first()).toBeVisible();
  await expect(page.getByText(/Hassan/i).first()).toBeVisible();
  // The [Inactive Res.] historical entry must never surface as its own resource row.
  await expect(page.getByText(/Inactive Res\./i)).toHaveCount(0);

  await openPrimaryPage(page, /^Imports$/i, /^Imports$/i);
  await uploadRealImport(page.locator('#imports-file-input'));
  await analyzeSelectedImport(page, 'Demand import after resource import');
  await moveImportWizardToValidation(page);

  await expect(
    page.locator('p[role="status"]').filter({ hasText: /Validation passed/i }),
  ).toContainText(/Validation passed/i);
  await completeImport(page);
});
