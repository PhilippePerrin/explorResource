import { expect, test } from '@playwright/test';

import {
  E2E_COMPANY,
  E2E_PROJECT,
  E2E_RESOURCE,
  E2E_RESOURCE_TYPE,
  downloadToBuffer,
  openPrimaryPage,
  setupAppWithSeed,
} from './helpers';

test('backup export, controlled wipe, and restore round-trip application data', async ({
  page,
}) => {
  await setupAppWithSeed(page, {
    companies: [E2E_COMPANY],
    projects: [E2E_PROJECT],
    resourceTypes: [E2E_RESOURCE_TYPE],
    resources: [E2E_RESOURCE],
  });

  await openPrimaryPage(page, /^Settings$/i, /^Settings$/i);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export backup as JSON/i }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/resource-capacity-planner-backup-.*\.json/i);
  const backupBuffer = await downloadToBuffer(download);
  expect(backupBuffer.byteLength).toBeGreaterThan(0);

  await page.getByRole('button', { name: /Reset app data/i }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Continue reset/i })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Delete all app data/i })
    .click();
  await expect(page.getByRole('status')).toContainText(/All application data has been reset\./i);

  await openPrimaryPage(page, /^Resources$/i, /^Resources$/i);
  await expect(page.getByText(/No resources match the current filters\./i)).toBeVisible();
  await openPrimaryPage(page, /^Projects$/i, /^Projects$/i);
  await expect(page.getByText(/No projects match the current filters\./i)).toBeVisible();

  await openPrimaryPage(page, /^Settings$/i, /^Settings$/i);
  await page.locator('#backup-file').setInputFiles({
    name: 'e2e-backup.json',
    mimeType: 'application/json',
    buffer: backupBuffer,
  });
  await page.getByRole('button', { name: /Validate and restore backup/i }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Restore and replace data/i })
    .click();

  await expect(page.getByRole('status')).toContainText(
    /Backup restored\. Existing data has been replaced atomically\./i,
  );
  await openPrimaryPage(page, /^Resources$/i, /^Resources$/i);
  await expect(page.getByText('Alice Martin')).toBeVisible();
  await openPrimaryPage(page, /^Projects$/i, /^Projects$/i);
  await expect(page.getByRole('table').getByText(E2E_PROJECT.code)).toBeVisible();
});
