import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

import type { Download, Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import * as XLSX from 'xlsx';

import type {
  Allocation,
  Company,
  DemandSnapshot,
  ImportBatch,
  Project,
  Release,
  Resource,
  ResourceType,
  WorkingDaysCalendar,
} from '@/domain/entities';

const IMPORT_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const REAL_IMPORT_FILE_NAME = 'export-philippe.perrin-151251-20260908-101608.xlsx';
const REAL_IMPORT_FILE_PATH = path.join(process.cwd(), 'tests', 'fixtures', REAL_IMPORT_FILE_NAME);
const REAL_RESOURCE_IMPORT_FILE_NAME = 'export-resource.xlsx';
const REAL_RESOURCE_IMPORT_FILE_PATH = path.join(
  process.cwd(),
  'tests',
  'fixtures',
  REAL_RESOURCE_IMPORT_FILE_NAME,
);
const TEST_YEAR = 2026;
const TEST_MONTH = 1;

type SeedStoreMap = Partial<{
  appSettings: Record<string, unknown>[];
  companies: Company[];
  resourceTypes: ResourceType[];
  resources: Resource[];
  releases: Release[];
  projects: Project[];
  groups: Record<string, unknown>[];
  projectReleases: Record<string, unknown>[];
  workingDaysCalendars: WorkingDaysCalendar[];
  resourceNonWorkingDays: Record<string, unknown>[];
  importBatches: ImportBatch[];
  importRawRows: Record<string, unknown>[];
  demandSnapshots: DemandSnapshot[];
  allocations: Allocation[];
  changeSets: Record<string, unknown>[];
  auditEntries: Record<string, unknown>[];
}>;

function readRealImportBuffer(): Buffer {
  return fs.readFileSync(REAL_IMPORT_FILE_PATH);
}

function buildWorkbookPayload(options: {
  fileName: string;
  projectCode: string;
  projectName: string;
  resourceTypeLabel: string;
  resourceName: string;
  januaryDemand: number;
  januarySupply?: number;
  includeDemandComment?: boolean;
}) {
  const januarySupply = options.januarySupply ?? 0;
  const januaryGap = Number((options.januaryDemand - januarySupply).toFixed(1));
  const rows = [
    [],
    [
      '.',
      '',
      'Status',
      'Resource',
      'Activity',
      'Total supply',
      'Total demand',
      '',
      '2026 JAN',
      '2026 FEB',
      '2026 MAR',
      '2026 APR',
      '2026 MAY',
      '2026 JUN',
      '2026 JUL',
      '2026 AUG',
      '2026 SEP',
      '2026 OCT',
      '2026 NOV',
      '2026 DEC',
    ],
    ['GIS0006 - Test Group'],
    [`${options.projectCode} - ${options.projectName}`],
    [
      '',
      '',
      'Published',
      options.resourceTypeLabel,
      options.projectName,
      januarySupply,
      options.januaryDemand,
      '',
      januaryGap,
    ],
    ['', '', '', options.resourceName, options.projectName, '', '', '', januarySupply],
  ];

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(rows);

  if (options.includeDemandComment ?? true) {
    worksheet.I5 = {
      ...worksheet.I5,
      c: [
        {
          a: 'Copilot',
          t: `Demand : ${options.januaryDemand.toFixed(1)} (Day) / ${options.januaryDemand.toFixed(1)} (FTE)\nSupply : ${januarySupply.toFixed(1)} (Day) / ${januarySupply.toFixed(1)} (FTE)`,
        },
      ],
    };
  }

  XLSX.utils.book_append_sheet(workbook, worksheet, 'DemandWorkload');

  return {
    name: options.fileName,
    mimeType: IMPORT_MIME_TYPE,
    buffer: Buffer.from(XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' })),
  };
}

export const E2E_COMPANY: Company = {
  id: '36aa0d16-1ac7-41d6-b4c1-83e0efb9800a',
  name: 'Acme Partners',
  status: 'active',
  createdAt: '2026-09-08T10:00:00.000Z',
  updatedAt: '2026-09-08T10:00:00.000Z',
};

export const E2E_RESOURCE_TYPE: ResourceType = {
  id: '513914fb-b956-4d15-84d9-b276873949aa',
  label: 'Developer',
  shortCode: 'DEV',
  color: '#00427f',
  status: 'active',
  displayOrder: 1,
  createdAt: '2026-09-08T10:00:00.000Z',
  updatedAt: '2026-09-08T10:00:00.000Z',
};

export const E2E_RESOURCE: Resource = {
  id: '90593ccf-d03f-4dfb-8f94-fab1d4e6657b',
  firstName: 'Alice',
  lastName: 'Martin',
  resourceTypeId: E2E_RESOURCE_TYPE.id,
  collaborationType: 'internal',
  status: 'active',
  createdAt: '2026-09-08T10:00:00.000Z',
  updatedAt: '2026-09-08T10:00:00.000Z',
};

export const E2E_RESOURCE_B: Resource = {
  id: '9f5cfeb3-7dc6-4afd-8c8a-c5dd91207ce0',
  firstName: 'Bob',
  lastName: 'Stone',
  resourceTypeId: E2E_RESOURCE_TYPE.id,
  collaborationType: 'internal',
  status: 'active',
  createdAt: '2026-09-08T10:00:00.000Z',
  updatedAt: '2026-09-08T10:00:00.000Z',
};

export const E2E_PROJECT: Project = {
  id: '1be5be37-cd25-4045-9f75-2a53d9789219',
  code: 'E0100',
  name: 'Commercial Analytics',
  status: 'active',
  createdAt: '2026-09-08T10:00:00.000Z',
  updatedAt: '2026-09-08T10:00:00.000Z',
};

export const E2E_WORKING_DAYS: WorkingDaysCalendar = {
  id: '13d8108f-43f0-46ca-bd62-f84f2c5d34bc',
  year: TEST_YEAR,
  month: TEST_MONTH,
  workingDaysCount: 20,
  createdAt: '2026-09-08T10:00:00.000Z',
  updatedAt: '2026-09-08T10:00:00.000Z',
};

export const E2E_DEMAND_SNAPSHOT: DemandSnapshot = {
  id: 'e9a9d2ee-1e6d-4d98-80c1-1bc17c15db2c',
  importBatchId: 'manual',
  projectCode: E2E_PROJECT.code,
  resourceTypeId: E2E_RESOURCE_TYPE.id,
  year: TEST_YEAR,
  month: TEST_MONTH,
  demandDays: 5,
  supplyDays: 0,
  origin: 'manual-adjustment',
  createdAt: '2026-09-08T10:00:00.000Z',
  updatedAt: '2026-09-08T10:00:00.000Z',
};

export const REAL_IMPORT_RESOURCE_TYPES: ResourceType[] = [
  {
    id: '2b973647-498d-4c42-8d90-71f668f30c2e',
    label: 'Commerce - SFDC Developer - EUR',
    shortCode: 'DEV',
    color: '#00427f',
    status: 'active',
    displayOrder: 1,
    createdAt: '2026-09-08T10:00:00.000Z',
    updatedAt: '2026-09-08T10:00:00.000Z',
  },
  {
    id: 'aaeb95ec-c04d-4c1d-9c85-b8d633258c2f',
    label: 'Commerce - SFDC Technical Analyst - EUR',
    shortCode: 'TA',
    color: '#00856a',
    status: 'active',
    displayOrder: 2,
    createdAt: '2026-09-08T10:00:00.000Z',
    updatedAt: '2026-09-08T10:00:00.000Z',
  },
  {
    id: '068dcff2-c8da-473d-bbba-e77daa0a61c4',
    label: 'Commerce - SFDC Release & Platform - EUR',
    shortCode: 'REL',
    color: '#7f4b00',
    status: 'active',
    displayOrder: 3,
    createdAt: '2026-09-08T10:00:00.000Z',
    updatedAt: '2026-09-08T10:00:00.000Z',
  },
];

const REAL_IMPORT_RESOURCE_TYPE_BY_LABEL = new Map(
  REAL_IMPORT_RESOURCE_TYPES.map((resourceType) => [resourceType.label, resourceType.id] as const),
);

function createRealImportResource(
  id: string,
  fullName: string,
  resourceTypeLabel: string,
): Resource {
  const [firstName, ...lastNameParts] = fullName.split(' ');
  const defaultResourceTypeId = REAL_IMPORT_RESOURCE_TYPES[0]?.id ?? E2E_RESOURCE_TYPE.id;

  return {
    id,
    firstName,
    lastName: lastNameParts.join(' '),
    resourceTypeId:
      REAL_IMPORT_RESOURCE_TYPE_BY_LABEL.get(resourceTypeLabel) ?? defaultResourceTypeId,
    collaborationType: 'internal',
    status: 'active',
    createdAt: '2026-09-08T10:00:00.000Z',
    updatedAt: '2026-09-08T10:00:00.000Z',
  };
}

export const REAL_IMPORT_RESOURCES: Resource[] = [
  createRealImportResource(
    'd102be58-c474-40e9-9601-ca6c318ea00b',
    'Abderrahmane OUSSALAH',
    'Commerce - SFDC Technical Analyst - EUR',
  ),
  createRealImportResource(
    '1e290bbb-c63b-442f-bf41-68ba0b0ca6c4',
    'Aboubacar DIALLO',
    'Commerce - SFDC Technical Analyst - EUR',
  ),
  createRealImportResource(
    'b50390db-ff4f-4c7d-ad4b-aebcdd80a8ae',
    'André ESTEVES',
    'Commerce - SFDC Developer - EUR',
  ),
  createRealImportResource(
    '75783f28-e151-4f5d-9dc1-30bb6b4063fe',
    'Bechir YAHIA',
    'Commerce - SFDC Technical Analyst - EUR',
  ),
  createRealImportResource(
    '59a5d83f-507c-4d06-a0be-144892ae43bb',
    'Bruno MONTEIRO',
    'Commerce - SFDC Developer - EUR',
  ),
  createRealImportResource(
    '083b1e58-ddc6-4651-9cf5-8e76fc89e61e',
    'David CARRASCO',
    'Commerce - SFDC Technical Analyst - EUR',
  ),
  createRealImportResource(
    'ba93e7dc-5b84-42f8-9ae5-1499d734d43d',
    'Eli VELOSO',
    'Commerce - SFDC Developer - EUR',
  ),
  createRealImportResource(
    '1dc10fa6-d286-4b24-b70f-5d5a399a3b84',
    'Hassan ALAMI',
    'Commerce - SFDC Release & Platform - EUR',
  ),
  createRealImportResource(
    'c50f4817-77a7-4400-ab40-c38739351340',
    'Laura PICHON',
    'Commerce - SFDC Release & Platform - EUR',
  ),
  createRealImportResource(
    '30f361a9-25fc-42ce-a644-00e6e59399f5',
    'Ly HO',
    'Commerce - SFDC Technical Analyst - EUR',
  ),
  createRealImportResource(
    '7a1f984b-c5b3-4770-a2da-0d33915a80b2',
    'Mehdi KHADDOR',
    'Commerce - SFDC Technical Analyst - EUR',
  ),
  createRealImportResource(
    'f7419cc4-15cc-41a9-a28e-86f421dca915',
    'Mohamed-Amine BENAMAR',
    'Commerce - SFDC Developer - EUR',
  ),
  createRealImportResource(
    'b056e711-afae-48ba-84fb-cc2f7e33e83a',
    'Mohamed-Yassine NAOUM',
    'Commerce - SFDC Developer - EUR',
  ),
  createRealImportResource(
    '1f1e8d58-a7eb-4636-b40d-ebc18fbbd581',
    'Mustapha ELMADI',
    'Commerce - SFDC Developer - EUR',
  ),
  createRealImportResource(
    '4d9ae3a2-4f1c-4a8c-90c9-311fc112193f',
    'Nicolas FAURE',
    'Commerce - SFDC Developer - EUR',
  ),
  createRealImportResource(
    '6f939bdb-405d-414c-b462-bb8f55f061e3',
    'Paulo OLIVEIRA',
    'Commerce - SFDC Developer - EUR',
  ),
  createRealImportResource(
    'c5cda10e-71c5-4d71-a82d-90ced719d0f4',
    'Pavlo STRATOVYCH',
    'Commerce - SFDC Developer - EUR',
  ),
  createRealImportResource(
    'd80ca93c-15d5-4325-af71-95da5be9e550',
    'Salim SLAMI',
    'Commerce - SFDC Developer - EUR',
  ),
  createRealImportResource(
    '241f7789-0960-4f5f-8117-f9bcf37f93c9',
    'Sami IKHADALLEM',
    'Commerce - SFDC Technical Analyst - EUR',
  ),
  createRealImportResource(
    '4c0b340e-2897-4ff9-9e21-cd8e0fb4fa48',
    'Wanderson DANTAS',
    'Commerce - SFDC Developer - EUR',
  ),
  createRealImportResource(
    'a22cdd0c-910f-427e-89d6-19b6a5cefe4e',
    'Warda MANI',
    'Commerce - SFDC Developer - EUR',
  ),
  createRealImportResource(
    'fcb1e5e8-e065-4fec-a7d7-2753d7a4ad43',
    'Xavier MAMET',
    'Commerce - SFDC Developer - EUR',
  ),
  createRealImportResource(
    '1d81d9fd-f2c4-4e42-8247-c8dcf5906d82',
    'Zakaria IDER',
    'Commerce - SFDC Release & Platform - EUR',
  ),
];

export function createModifiedRealImportPayload() {
  const workbook = XLSX.read(readRealImportBuffer(), {
    type: 'buffer',
    cellComments: true,
    cellStyles: true,
  });
  const worksheet = workbook.Sheets[workbook.SheetNames[0] ?? 'DemandWorkload'];
  const januaryDemand = 1.2;

  if (!worksheet?.I5) {
    throw new Error('Unable to locate I5 in the real import fixture.');
  }

  worksheet.I5 = {
    ...worksheet.I5,
    v: januaryDemand,
    w: januaryDemand.toFixed(1),
    c: [
      {
        a: 'Auteur',
        t: `Demand : ${januaryDemand.toFixed(1)} (Day) / ${januaryDemand.toFixed(1)} (FTE)\nSupply : 0.0 (Day) / 0.0 (FTE)`,
      },
    ],
  };

  return {
    name: 'export-philippe.perrin-151251-20260908-101608-delta.xlsx',
    mimeType: IMPORT_MIME_TYPE,
    buffer: Buffer.from(XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' })),
  };
}

export function createUnknownResourceImportPayload() {
  return buildWorkbookPayload({
    fileName: 'unknown-resource-anomaly.xlsx',
    projectCode: 'E0200',
    projectName: 'Anomaly Resolution Project',
    resourceTypeLabel: E2E_RESOURCE_TYPE.label,
    resourceName: 'Missing PERSON',
    januaryDemand: 3,
    januarySupply: 1,
    includeDemandComment: false,
  });
}

export async function gotoShell(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: /Primary/i })).toBeVisible();
}

export async function openPrimaryPage(
  page: Page,
  label: string | RegExp,
  heading: string | RegExp,
) {
  await page.getByRole('link', { name: label }).click();
  await expect(page.getByRole('heading', { name: heading })).toBeVisible();
}

export async function seedDatabase(page: Page, seed: SeedStoreMap) {
  // Writes through the app's own repository layer (window.__plannerTestSeed,
  // installed by src/testHooks.ts) rather than touching storage directly:
  // the production database lives behind a dedicated Worker (OPFS), which
  // page.evaluate (main-thread only) cannot reach the way it could reach
  // IndexedDB before this migration.
  await page.evaluate(async (recordsByStore) => {
    if (!window.__plannerTestSeed) {
      throw new Error(
        'window.__plannerTestSeed is unavailable — was the app built with --mode e2e (VITE_E2E_TEST_HOOKS=1)?',
      );
    }

    await window.__plannerTestSeed(recordsByStore);
  }, seed);
}

export async function setupAppWithSeed(page: Page, seed: SeedStoreMap) {
  await gotoShell(page);
  await page.getByRole('link', { name: /^Settings$/i }).click();
  await expect(page.getByRole('heading', { name: /^Settings$/i })).toBeVisible();
  await seedDatabase(page, seed);
  await page.reload();
  await expect(page.getByRole('navigation', { name: /Primary/i })).toBeVisible();
}

export async function uploadFile(
  locator: Locator,
  file: { name: string; mimeType: string; buffer: Buffer },
) {
  await locator.setInputFiles(file);
}

export async function uploadRealImport(locator: Locator) {
  await locator.setInputFiles(REAL_IMPORT_FILE_PATH);
}

export async function uploadRealResourceImport(locator: Locator) {
  await locator.setInputFiles(REAL_RESOURCE_IMPORT_FILE_PATH);
}

export async function analyzeSelectedImport(page: Page, note?: string) {
  if (note) {
    await page.getByLabel(/Import note/i).fill(note);
  }

  await page.getByRole('button', { name: /Start technical analysis/i }).click();
  await expect(
    page.locator('p[role="status"]').filter({ hasText: /Technical analysis completed/i }),
  ).toBeVisible({ timeout: 120_000 });
}

export async function moveImportWizardToValidation(page: Page) {
  for (let index = 0; index < 5; index += 1) {
    await page.getByRole('button', { name: /Next step/i }).click();
  }

  await expect(page.getByRole('heading', { name: /8\. Validation/i })).toBeVisible();
}

export async function completeImport(page: Page) {
  await page.getByRole('button', { name: /Commit atomic import/i }).click();
  await expect(page.getByRole('heading', { name: /10\. Final report/i })).toBeVisible();
  await expect(
    page.getByText(/Import committed successfully\. Download the Markdown report/i),
  ).toBeVisible({
    timeout: 120_000,
  });
}

export async function downloadToBuffer(download: Download): Promise<Buffer> {
  const stream = await download.createReadStream();

  if (!stream) {
    throw new Error('Expected Playwright to provide a readable download stream.');
  }

  const chunks: Buffer[] = [];

  for await (const chunk of Readable.from(stream)) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

export {
  IMPORT_MIME_TYPE,
  REAL_IMPORT_FILE_NAME,
  REAL_IMPORT_FILE_PATH,
  REAL_RESOURCE_IMPORT_FILE_NAME,
  REAL_RESOURCE_IMPORT_FILE_PATH,
  TEST_MONTH,
  TEST_YEAR,
};
