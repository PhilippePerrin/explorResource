import { expect, test } from '@playwright/test';

import {
  analyzeSelectedImport,
  completeImport,
  createModifiedRealImportPayload,
  createUnknownResourceImportPayload,
  E2E_RESOURCE_TYPE,
  moveImportWizardToValidation,
  openPrimaryPage,
  REAL_IMPORT_RESOURCES,
  REAL_IMPORT_RESOURCE_TYPES,
  setupAppWithSeed,
  uploadFile,
  uploadRealImport,
} from './helpers';

test.describe.configure({ mode: 'serial' });
test.setTimeout(240_000);

test('imports the real workbook, accepts a distinct second import, and renders comparison deltas', async ({
  page,
}) => {
  await setupAppWithSeed(page, {
    resourceTypes: REAL_IMPORT_RESOURCE_TYPES,
    resources: REAL_IMPORT_RESOURCES,
  });

  await openPrimaryPage(page, /^Imports$/i, /^Imports$/i);
  await uploadRealImport(page.locator('#imports-file-input'));
  await analyzeSelectedImport(page, 'Initial real fixture import');

  await expect(page.getByRole('heading', { name: /3\. Preview/i })).toBeVisible();
  await expect(page.getByText('24')).toBeVisible();
  await moveImportWizardToValidation(page);
  await expect(
    page.locator('p[role="status"]').filter({ hasText: /Validation passed/i }),
  ).toContainText(/Validation passed/i);
  await completeImport(page);

  const importHistory = page.locator('section').filter({
    has: page.getByRole('heading', { name: /Import history/i }),
  });
  await expect(
    importHistory.getByText(/export-philippe\.perrin-151251-20260908-101608\.xlsx/i),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /Download report/i })).toBeVisible();

  await page.getByRole('button', { name: /Start another import/i }).click();
  const modifiedImport = createModifiedRealImportPayload();
  await uploadFile(page.locator('#imports-file-input'), modifiedImport);
  await analyzeSelectedImport(page, 'Modified real fixture import');
  await moveImportWizardToValidation(page);
  await expect(
    page.locator('p[role="status"]').filter({ hasText: /Validation passed/i }),
  ).toContainText(/Validation passed/i);
  await completeImport(page);

  await expect(importHistory.getByText(modifiedImport.name)).toBeVisible();
  await expect(page.getByText(/2 validated batch\(es\)/i)).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Demand comparison$/i })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'E0100' }).first()).toContainText(/\+1/);
});

test('surfaces an import anomaly and the same workbook succeeds once the missing resource is created', async ({
  page,
}) => {
  await setupAppWithSeed(page, {
    resourceTypes: [E2E_RESOURCE_TYPE],
  });

  await openPrimaryPage(page, /^Imports$/i, /^Imports$/i);
  const anomalyImport = createUnknownResourceImportPayload();
  await uploadFile(page.locator('#imports-file-input'), anomalyImport);
  await analyzeSelectedImport(page, 'Intentional anomaly run');
  await page.getByRole('button', { name: /Next step/i }).click();
  await page.getByRole('button', { name: /Next step/i }).click();
  await page.getByRole('button', { name: /Next step/i }).click();

  await expect(page.getByRole('heading', { name: /6\. Anomaly review/i })).toBeVisible();
  await expect(page.getByRole('table').getByText(/Missing PERSON/i)).toBeVisible();

  await page.getByRole('button', { name: /Next step/i }).click();
  await page.getByRole('button', { name: /Next step/i }).click();
  await expect(
    page.locator('p[role="status"]').filter({ hasText: /Blocking anomalies detected/i }),
  ).toContainText(/Blocking anomalies detected/i);
  await expect(page.getByRole('button', { name: /Commit atomic import/i })).toBeDisabled();

  await openPrimaryPage(page, /^Resources$/i, /^Resources$/i);
  await page.getByLabel(/First name/i).fill('Missing');
  await page.getByLabel(/Last name/i).fill('PERSON');
  await page.locator('#resource-resource-type').selectOption(E2E_RESOURCE_TYPE.id);
  await page.getByRole('button', { name: /^Create resource$/i }).click();
  await expect(page.getByRole('status')).toContainText(/Resource created\./i);

  await openPrimaryPage(page, /^Imports$/i, /^Imports$/i);
  await uploadFile(page.locator('#imports-file-input'), anomalyImport);
  await analyzeSelectedImport(page, 'Resolved anomaly run');
  await moveImportWizardToValidation(page);

  await expect(
    page.locator('p[role="status"]').filter({ hasText: /Validation passed/i }),
  ).toContainText(/Validation passed/i);
  await completeImport(page);
  const importHistory = page.locator('section').filter({
    has: page.getByRole('heading', { name: /Import history/i }),
  });
  await expect(importHistory.getByText(anomalyImport.name)).toBeVisible();
});
