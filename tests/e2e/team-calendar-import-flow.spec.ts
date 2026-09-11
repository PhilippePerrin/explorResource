import { expect, test } from '@playwright/test';

import type { Resource } from '@/domain/entities';

import {
  E2E_RESOURCE_TYPE,
  openPrimaryPage,
  setupAppWithSeed,
  uploadRealTeamCalendarImport,
} from './helpers';

test.describe.configure({ mode: 'serial' });
test.setTimeout(240_000);

const TEAM_CALENDAR_RESOURCE_NAMES: [firstName: string, lastName: string][] = [
  ['Abderrahmane', 'OUSSALAH'],
  ['Aboubacar', 'DIALLO'],
  ['Bechir', 'YAHIA'],
  ['Bruno', 'MONTEIRO'],
  ['David', 'CARRASCO'],
  ['Eli', 'VELOSO'],
  ['Hassan', 'ALAMI'],
  ['Laura', 'PICHON'],
  ['Ly', 'HO'],
  ['Mathieu', 'GOLLNICK'],
  // Kept in the file's own casing to exercise case/accent-insensitive matching.
  ['Mehdi', 'Khaddor'],
  ['Mohamed-Amine', 'BENAMAR'],
  ['Mohamed-Yassine', 'NAOUM'],
  ['Mustapha', 'ELMADI'],
  ['Nicolas', 'FAURE'],
  ['Paulo', 'OLIVEIRA'],
  ['Pavlo', 'STRATOVYCH'],
  ['André', 'ESTEVES'],
  ['Sami', 'IKHADALLEM'],
  ['Salim', 'Slami'],
  ['Wanderson', 'DANTAS'],
  ['Warda', 'MANI'],
  ['Xavier', 'MAMET'],
  ['Zakaria', 'IDER'],
];

const TEAM_CALENDAR_RESOURCES: Resource[] = TEAM_CALENDAR_RESOURCE_NAMES.map(
  ([firstName, lastName], index) => ({
    id: `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    firstName,
    lastName,
    resourceTypeId: E2E_RESOURCE_TYPE.id,
    collaborationType: 'internal',
    status: 'active',
    createdAt: '2026-09-08T10:00:00.000Z',
    updatedAt: '2026-09-08T10:00:00.000Z',
  }),
);

test('imports the real Team Calendar workbook into the Non-working Days grid', async ({
  page,
}) => {
  await setupAppWithSeed(page, {
    resourceTypes: [E2E_RESOURCE_TYPE],
    resources: TEAM_CALENDAR_RESOURCES,
  });

  await openPrimaryPage(page, /^Import non-working days$/i, /^Import non-working days$/i);
  await uploadRealTeamCalendarImport(page.locator('#team-calendar-import-file-input'));
  await page.getByRole('button', { name: /Start technical analysis/i }).click();
  await expect(
    page.locator('p[role="status"]').filter({ hasText: /Technical analysis completed/i }),
  ).toBeVisible({ timeout: 120_000 });

  await expect(page.getByRole('heading', { name: /2\. Preview/i })).toBeVisible();
  await expect(page.getByText('Matched resources', { exact: true })).toBeVisible();
  await expect(page.getByText('Unmatched resources', { exact: true })).toBeVisible();
  // All 24 names in the file must resolve — including the two case-mismatched
  // ones ("Mehdi Khaddor", "Salim Slami") via the case/accent-insensitive match.
  const unmatchedValue = page
    .getByText('Unmatched resources', { exact: true })
    .locator('xpath=following-sibling::p[1]');
  await expect(unmatchedValue).toHaveText('0');

  await page.getByRole('button', { name: /Next step/i }).click();
  await expect(page.getByRole('heading', { name: /3\. Anomaly review/i })).toBeVisible();
  await expect(page.getByText(/blocking/i)).toHaveCount(0);

  await page.getByRole('button', { name: /Next step/i }).click();
  await expect(page.getByRole('heading', { name: /4\. Commit/i })).toBeVisible();
  await expect(
    page.locator('p[role="status"]').filter({ hasText: /Validation passed/i }),
  ).toBeVisible();
  await page.getByRole('button', { name: /Commit non-working days import/i }).click();

  await expect(page.getByRole('heading', { name: /5\. Final report/i })).toBeVisible();
  await expect(
    page.locator('p[role="status"]').filter({ hasText: /import committed successfully/i }),
  ).toBeVisible({ timeout: 120_000 });

  const importHistory = page.locator('section').filter({
    has: page.getByRole('heading', { name: /Import history/i }),
  });
  await expect(importHistory.getByText(/team-calendar\.xlsx/i)).toBeVisible();

  await openPrimaryPage(page, /^Non-working Days$/i, /^Non-working Days$/i);
  await page.getByLabel(/^Year$/i).fill('2025');

  // David CARRASCO's August 2025 PTO block should show up as a large value.
  const davidRow = page.locator('tr').filter({ hasText: 'David CARRASCO' });
  await expect(davidRow).toBeVisible();
  const augustCellValue = await davidRow.locator('input').nth(7).inputValue();
  expect(Number(augustCellValue)).toBeGreaterThan(10);
});
