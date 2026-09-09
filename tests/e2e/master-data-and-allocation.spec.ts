import { expect, test } from '@playwright/test';

import {
  E2E_COMPANY,
  E2E_DEMAND_SNAPSHOT,
  E2E_PROJECT,
  E2E_RESOURCE,
  E2E_RESOURCE_B,
  E2E_RESOURCE_TYPE,
  E2E_WORKING_DAYS,
  openPrimaryPage,
  setupAppWithSeed,
  TEST_MONTH,
  TEST_YEAR,
} from './helpers';

test('resource, project, and release creation flows persist linked master data', async ({
  page,
}) => {
  await setupAppWithSeed(page, {
    companies: [E2E_COMPANY],
    resourceTypes: [E2E_RESOURCE_TYPE],
  });

  await openPrimaryPage(page, /^Resources$/i, /^Resources$/i);
  await page.getByRole('button', { name: /^New resource$/i }).click();
  const resourceDrawer = page.getByRole('dialog', { name: /Create resource/i });
  await resourceDrawer.getByLabel(/First name/i).fill('Alice');
  await resourceDrawer.getByLabel(/Last name/i).fill('Martin');
  await resourceDrawer.locator('#resource-resource-type').selectOption(E2E_RESOURCE_TYPE.id);
  await resourceDrawer.locator('#resource-collaboration-type').selectOption('external');
  await resourceDrawer.locator('#resource-company').selectOption(E2E_COMPANY.id);
  await resourceDrawer.getByRole('button', { name: /^Create resource$/i }).click();

  await expect(page.getByRole('status')).toContainText(/Resource created\./i);
  await expect(page.getByRole('table').getByText('Alice Martin')).toBeVisible();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Close panel/i })
    .click();

  await openPrimaryPage(page, /^Projects$/i, /^Projects$/i);
  await page.getByRole('button', { name: /^New project$/i }).click();
  const projectDrawer = page.getByRole('dialog', { name: /Create project/i });
  await projectDrawer.getByLabel(/Project code/i).fill('e1234');
  await projectDrawer.getByLabel(/Project name/i).fill('Lot 13 Automation');
  await projectDrawer.getByRole('button', { name: /^Create project$/i }).click();

  await expect(page.getByRole('status')).toContainText(/Project created\./i);
  await expect(page.getByRole('table').getByText('E1234')).toBeVisible();

  await openPrimaryPage(page, /^Releases$/i, /^Releases$/i);
  await page.getByRole('button', { name: /^New release$/i }).click();
  const releaseDrawer = page.getByRole('dialog', { name: /Create release/i });
  await releaseDrawer.getByLabel(/Release name/i).fill('Wave 13');
  await releaseDrawer.getByLabel(/Go-live date/i).fill('2026-10-15');
  await releaseDrawer.getByLabel(/E1234/i).check();
  await releaseDrawer.getByRole('button', { name: /^Create release$/i }).click();

  await expect(page.getByRole('status')).toContainText(/Release created\./i);
  const releaseList = page.locator('section').filter({
    has: page.getByRole('heading', { name: /Release list/i }),
  });
  await expect(releaseList.getByText('Wave 13')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('navigation', { name: /Primary/i })).toBeVisible();
  await openPrimaryPage(page, /^Resources$/i, /^Resources$/i);
  await expect(page.getByRole('table').getByText('Alice Martin')).toBeVisible();
  await openPrimaryPage(page, /^Projects$/i, /^Projects$/i);
  await expect(page.getByRole('table').getByText('E1234')).toBeVisible();
  await openPrimaryPage(page, /^Releases$/i, /^Releases$/i);
  await expect(releaseList.getByText('Wave 13')).toBeVisible();
});

test('allocation studio keyboard flow requires Save draft and resources allow overload and edits', async ({
  page,
}) => {
  await setupAppWithSeed(page, {
    projects: [E2E_PROJECT],
    resourceTypes: [E2E_RESOURCE_TYPE],
    resources: [E2E_RESOURCE, E2E_RESOURCE_B],
    workingDaysCalendars: [E2E_WORKING_DAYS],
    demandSnapshots: [E2E_DEMAND_SNAPSHOT],
  });

  await openPrimaryPage(page, /^Allocation Studio$/i, /^Allocation Studio$/i);
  await expect(page.getByRole('heading', { name: /Keyboard allocation form/i })).toBeVisible();

  await page.locator('#studio-resource').focus();
  await page.locator('#studio-resource').selectOption(E2E_RESOURCE.id);
  await page.locator('#studio-project').focus();
  await page.locator('#studio-project').selectOption(E2E_PROJECT.code);
  await page.locator('#studio-form-type').focus();
  await page.locator('#studio-form-type').selectOption(E2E_RESOURCE_TYPE.id);
  await page.locator('#studio-form-year').fill(String(TEST_YEAR));
  await page.locator('#studio-form-month').selectOption(String(TEST_MONTH));
  await page.locator('#studio-form-days').fill('2');
  await page.getByRole('button', { name: /Queue change/i }).click();

  await expect(
    page.locator('p[role="status"]').filter({ hasText: /Draft allocation queued/i }),
  ).toContainText(/Draft allocation queued/i);
  const allocationBoard = page.locator('section').filter({
    has: page.getByRole('heading', { name: /Allocation board/i }),
  });
  const boardRow = allocationBoard.getByRole('row').filter({ hasText: E2E_PROJECT.code }).first();
  await expect(boardRow).toContainText(/Gap 3 d/i);

  await page.reload();
  await expect(page.getByRole('heading', { name: /^Allocation Studio$/i })).toBeVisible();
  await expect(page.getByText(/Gap 5 d/i)).toBeVisible();

  await page.locator('#studio-resource').selectOption(E2E_RESOURCE.id);
  await page.locator('#studio-project').selectOption(E2E_PROJECT.code);
  await page.locator('#studio-form-type').selectOption(E2E_RESOURCE_TYPE.id);
  await page.locator('#studio-form-year').fill(String(TEST_YEAR));
  await page.locator('#studio-form-month').selectOption(String(TEST_MONTH));
  await page.locator('#studio-form-days').fill('2');
  await page.getByRole('button', { name: /Queue change/i }).click();
  await page.getByRole('button', { name: /Save draft/i }).click();

  await expect(
    page.locator('p[role="status"]').filter({ hasText: /Allocation draft saved/i }),
  ).toContainText(/Allocation draft saved/i);
  await expect(boardRow).toContainText(/Gap 3 d/i);

  await page.reload();
  await expect(page.getByRole('heading', { name: /^Allocation Studio$/i })).toBeVisible();
  await expect(boardRow).toContainText(/Covered 2 d/i);
  await expect(boardRow).toContainText(/Gap 3 d/i);

  await page.locator('#studio-resource').selectOption(E2E_RESOURCE_B.id);
  await page.locator('#studio-project').selectOption(E2E_PROJECT.code);
  await page.locator('#studio-form-type').selectOption(E2E_RESOURCE_TYPE.id);
  await page.locator('#studio-form-year').fill(String(TEST_YEAR));
  await page.locator('#studio-form-month').selectOption(String(TEST_MONTH));
  await page.locator('#studio-form-days').fill('3');
  await page.getByRole('button', { name: /Queue change/i }).click();
  await page.getByRole('button', { name: /Save draft/i }).click();

  await expect(boardRow).toContainText(/Covered 5 d/i);
  await expect(boardRow).toContainText(/Gap 0 d/i);

  await openPrimaryPage(page, /^Resources$/i, /^Resources$/i);
  const resourceRow = page.getByRole('row').filter({ hasText: 'Alice Martin' });
  await resourceRow.getByRole('button', { name: /Edit details/i }).click();

  const allocationSection = page.locator('section').filter({
    has: page.getByRole('heading', { name: /Allocations for this resource/i }),
  });
  const allocationRow = allocationSection.getByRole('row').filter({ hasText: E2E_PROJECT.code });
  await allocationRow.getByRole('button', { name: /^Edit$/i }).click();

  await allocationSection.locator('#allocation-project').selectOption(E2E_PROJECT.code);
  await allocationSection.locator('#allocation-resource-type').selectOption(E2E_RESOURCE_TYPE.id);
  await allocationSection.locator('#allocation-year').fill(String(TEST_YEAR));
  await allocationSection.locator('#allocation-month').selectOption(String(TEST_MONTH));
  await allocationSection.locator('#allocation-allocated-days').fill('21');

  await expect(
    allocationSection
      .getByRole('alert')
      .filter({ hasText: /Overload is allowed and will be saved/i }),
  ).toContainText(/Overload is allowed and will be saved/i);
  await allocationSection.getByRole('button', { name: /^Save allocation$/i }).click();
  await expect(page.getByRole('status')).toContainText(/Allocation updated\./i);
  await expect(page.getByLabel(/Overload\./i).first()).toBeVisible();
  await expect(page.getByLabel(/Overload\./i).first()).toBeVisible();

  await expect(allocationRow).toContainText('21 d');
  await allocationRow.getByRole('button', { name: /^Edit$/i }).click();
  await allocationSection.locator('#allocation-allocated-days').fill('18');
  await allocationSection.getByRole('button', { name: /^Save allocation$/i }).click();

  await expect(page.getByRole('status')).toContainText(/Allocation updated\./i);
  await expect(
    allocationSection.getByRole('row').filter({ hasText: E2E_PROJECT.code }),
  ).toContainText('18 d');
});
