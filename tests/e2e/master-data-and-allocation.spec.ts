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

  async function queueAllocation(options: { resourceId: string; days: string }) {
    await page.getByRole('button', { name: /^Add allocation/ }).click();
    const drawer = page.getByRole('dialog', { name: /Add allocation/i });
    await drawer.locator('#studio-resource').selectOption(options.resourceId);
    await drawer.locator('#studio-project').selectOption(E2E_PROJECT.code);
    await drawer.locator('#studio-form-type').selectOption(E2E_RESOURCE_TYPE.id);
    await drawer.locator('#studio-form-year').fill(String(TEST_YEAR));
    await drawer.locator('#studio-form-month').selectOption(String(TEST_MONTH));
    await drawer.locator('#studio-form-days').fill(options.days);
    await drawer.getByRole('button', { name: /Queue change/i }).click();
  }

  await queueAllocation({ resourceId: E2E_RESOURCE.id, days: '2' });

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

  await queueAllocation({ resourceId: E2E_RESOURCE.id, days: '2' });
  await page.getByRole('button', { name: /Save draft/i }).click();

  await expect(
    page.locator('p[role="status"]').filter({ hasText: /Allocation draft saved/i }),
  ).toContainText(/Allocation draft saved/i);
  await expect(boardRow).toContainText(/Gap 3 d/i);

  await page.reload();
  await expect(page.getByRole('heading', { name: /^Allocation Studio$/i })).toBeVisible();
  await expect(boardRow).toContainText(/Covered 2 d/i);
  await expect(boardRow).toContainText(/Gap 3 d/i);

  await queueAllocation({ resourceId: E2E_RESOURCE_B.id, days: '3' });
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

test('dragging a resource card onto a project row queues allocations across every visible month', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await setupAppWithSeed(page, {
    projects: [E2E_PROJECT],
    resourceTypes: [E2E_RESOURCE_TYPE],
    resources: [E2E_RESOURCE],
    workingDaysCalendars: [E2E_WORKING_DAYS],
    demandSnapshots: [E2E_DEMAND_SNAPSHOT],
  });

  await openPrimaryPage(page, /^Allocation Studio$/i, /^Allocation Studio$/i);

  const benchCard = page.getByRole('button', { name: /Alice Martin/i }).first();
  const targetCell = page
    .getByRole('button', { name: /E0100 Commercial Analytics, month January/i })
    .first();

  await targetCell.scrollIntoViewIfNeeded();
  await benchCard.scrollIntoViewIfNeeded();

  const sourceBox = await benchCard.boundingBox();
  const targetBox = await targetCell.boundingBox();

  if (!sourceBox || !targetBox) {
    throw new Error('Could not locate the bench card or the target board cell.');
  }

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    sourceBox.x + sourceBox.width / 2 + 20,
    sourceBox.y + sourceBox.height / 2 + 20,
    { steps: 5 },
  );
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {
    steps: 10,
  });
  await page.mouse.up();

  // Rule A: any resource-tile drop fans out across every visible month
  // (Focus defaults to "Year", so all 12), regardless of which specific
  // month cell was the physical drop target — the panel reviews the whole
  // batch before anything is committed.
  const panel = page.getByRole('dialog', { name: /Add across all visible months/i });
  await expect(panel).toBeVisible();
  const januaryRow = panel.getByRole('row').filter({ hasText: 'January' });
  const februaryRow = panel.getByRole('row').filter({ hasText: 'February' });
  await expect(januaryRow).toContainText('5 d');
  await expect(februaryRow).toContainText('1 d');

  await panel.getByRole('button', { name: /Queue change/i }).click();
  await expect(
    page.locator('p[role="status"]').filter({ hasText: /Draft allocations queued for 12 month/i }),
  ).toContainText(/Draft allocations queued for 12 month/i);

  await page.getByRole('button', { name: /Save draft/i }).click();
  await expect(
    page.locator('p[role="status"]').filter({ hasText: /Allocation draft saved/i }),
  ).toContainText(/Allocation draft saved/i);

  await expect(page.getByText(/Covered 5 d/i)).toBeVisible();
  const assignmentCellFebruary = page.getByRole('button', {
    name: /Alice Martin in E0100, month February: 1 d/i,
  });
  await expect(assignmentCellFebruary).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: /^Allocation Studio$/i })).toBeVisible();
  await expect(page.getByText(/Covered 5 d/i)).toBeVisible();
  await expect(assignmentCellFebruary).toBeVisible();
});

test('arming a resource and using the row-level activator adds it across every visible month without any drag', async ({
  page,
}) => {
  await setupAppWithSeed(page, {
    projects: [E2E_PROJECT],
    resourceTypes: [E2E_RESOURCE_TYPE],
    resources: [E2E_RESOURCE],
    workingDaysCalendars: [E2E_WORKING_DAYS],
    demandSnapshots: [E2E_DEMAND_SNAPSHOT],
  });

  await openPrimaryPage(page, /^Allocation Studio$/i, /^Allocation Studio$/i);

  const addAcrossButton = page.getByRole('button', { name: /Add across all visible months/i });
  await expect(addAcrossButton).toBeDisabled();

  await page.getByRole('button', { name: /Alice Martin/i, pressed: false }).click();
  await expect(addAcrossButton).toBeEnabled();
  await addAcrossButton.click();

  const panel = page.getByRole('dialog', { name: /Add across all visible months/i });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('row').filter({ hasText: 'January' })).toContainText('5 d');

  await panel.getByRole('button', { name: /Queue change/i }).click();
  await expect(
    page.locator('p[role="status"]').filter({ hasText: /Draft allocations queued for 12 month/i }),
  ).toBeVisible();

  await page.getByRole('button', { name: /Save draft/i }).click();
  await expect(
    page.locator('p[role="status"]').filter({ hasText: /Allocation draft saved/i }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Alice Martin in E0100, month December: 1 d/i }),
  ).toBeVisible();
});

test('editing an assignment cell inline and unassigning a resource from a project', async ({
  page,
}) => {
  await setupAppWithSeed(page, {
    projects: [E2E_PROJECT],
    resourceTypes: [E2E_RESOURCE_TYPE],
    resources: [E2E_RESOURCE],
    workingDaysCalendars: [E2E_WORKING_DAYS],
    demandSnapshots: [E2E_DEMAND_SNAPSHOT],
  });

  await openPrimaryPage(page, /^Allocation Studio$/i, /^Allocation Studio$/i);

  await page.getByRole('button', { name: /^Add allocation/ }).click();
  const drawer = page.getByRole('dialog', { name: /Add allocation/i });
  await drawer.locator('#studio-resource').selectOption(E2E_RESOURCE.id);
  await drawer.locator('#studio-project').selectOption(E2E_PROJECT.code);
  await drawer.locator('#studio-form-type').selectOption(E2E_RESOURCE_TYPE.id);
  await drawer.locator('#studio-form-year').fill(String(TEST_YEAR));
  await drawer.locator('#studio-form-month').selectOption(String(TEST_MONTH));
  await drawer.locator('#studio-form-days').fill('2');
  await drawer.getByRole('button', { name: /Queue change/i }).click();
  await page.getByRole('button', { name: /Save draft/i }).click();
  await expect(
    page.locator('p[role="status"]').filter({ hasText: /Allocation draft saved/i }),
  ).toBeVisible();

  const assignmentCell = page.getByRole('button', {
    name: /Alice Martin in E0100, month January: 2 d/i,
  });
  await expect(assignmentCell).toBeVisible();
  await assignmentCell.click();

  await expect(page.getByRole('dialog', { name: /Add allocation/i })).not.toBeVisible();
  const cellInput = page.getByRole('spinbutton', {
    name: /Alice Martin in E0100, month January: days allocated/i,
  });
  await cellInput.fill('4.5');
  await cellInput.press('Enter');

  await expect(
    page.getByRole('button', { name: /Alice Martin in E0100, month January: 4.5 d/i }),
  ).toBeVisible();
  await page.getByRole('button', { name: /Save draft/i }).click();

  await page.reload();
  await expect(page.getByRole('heading', { name: /^Allocation Studio$/i })).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Alice Martin in E0100, month January: 4.5 d/i }),
  ).toBeVisible();

  await page.getByRole('button', { name: /Unassign Alice Martin from E0100/i }).click();
  const unassignDialog = page.getByRole('dialog', { name: /Unassign resource/i });
  await expect(unassignDialog).toContainText(/Alice Martin/i);
  await expect(unassignDialog).toContainText(/4.5 d/i);
  await unassignDialog.getByRole('button', { name: /^Unassign$/i }).click();

  await expect(
    page.getByRole('button', { name: /Alice Martin in E0100, month January/i }),
  ).not.toBeVisible();
  await page.getByRole('button', { name: /Save draft/i }).click();

  await page.reload();
  await expect(page.getByRole('heading', { name: /^Allocation Studio$/i })).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Alice Martin in E0100, month January/i }),
  ).not.toBeVisible();
});
