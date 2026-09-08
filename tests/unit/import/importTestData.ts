import fs from 'node:fs';
import path from 'node:path';

import type { ImportBatch, Resource, ResourceType } from '@/domain/entities';

export const IMPORT_FIXTURE_PATH = path.join(
  process.cwd(),
  'tests',
  'fixtures',
  'export-philippe.perrin-151251-20260908-101608.xlsx',
);

export function readImportFixtureBuffer(): ArrayBuffer {
  const file = fs.readFileSync(IMPORT_FIXTURE_PATH);
  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
}

export const FIXTURE_RESOURCE_TYPES: ResourceType[] = [
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

const RESOURCE_TYPE_BY_LABEL = new Map(
  FIXTURE_RESOURCE_TYPES.map((resourceType) => [resourceType.label, resourceType.id] as const),
);

function createResource(id: string, fullName: string, resourceTypeLabel: string): Resource {
  const [firstName, ...lastNameParts] = fullName.split(' ');
  const fallbackResourceTypeId = FIXTURE_RESOURCE_TYPES[0]?.id;

  if (!firstName || !fallbackResourceTypeId) {
    throw new Error('Invalid fixture resource configuration.');
  }

  return {
    id,
    firstName,
    lastName: lastNameParts.join(' '),
    resourceTypeId: RESOURCE_TYPE_BY_LABEL.get(resourceTypeLabel) ?? fallbackResourceTypeId,
    collaborationType: 'internal',
    status: 'active',
    createdAt: '2026-09-08T10:00:00.000Z',
    updatedAt: '2026-09-08T10:00:00.000Z',
  };
}

export const FIXTURE_RESOURCES: Resource[] = [
  createResource(
    'd102be58-c474-40e9-9601-ca6c318ea00b',
    'Abderrahmane OUSSALAH',
    'Commerce - SFDC Technical Analyst - EUR',
  ),
  createResource(
    '1e290bbb-c63b-442f-bf41-68ba0b0ca6c4',
    'Aboubacar DIALLO',
    'Commerce - SFDC Technical Analyst - EUR',
  ),
  createResource(
    'b50390db-ff4f-4c7d-ad4b-aebcdd80a8ae',
    'André ESTEVES',
    'Commerce - SFDC Developer - EUR',
  ),
  createResource(
    '75783f28-e151-4f5d-9dc1-30bb6b4063fe',
    'Bechir YAHIA',
    'Commerce - SFDC Technical Analyst - EUR',
  ),
  createResource(
    '59a5d83f-507c-4d06-a0be-144892ae43bb',
    'Bruno MONTEIRO',
    'Commerce - SFDC Developer - EUR',
  ),
  createResource(
    '083b1e58-ddc6-4651-9cf5-8e76fc89e61e',
    'David CARRASCO',
    'Commerce - SFDC Technical Analyst - EUR',
  ),
  createResource(
    'ba93e7dc-5b84-42f8-9ae5-1499d734d43d',
    'Eli VELOSO',
    'Commerce - SFDC Developer - EUR',
  ),
  createResource(
    '1dc10fa6-d286-4b24-b70f-5d5a399a3b84',
    'Hassan ALAMI',
    'Commerce - SFDC Release & Platform - EUR',
  ),
  createResource(
    'c50f4817-77a7-4400-ab40-c38739351340',
    'Laura PICHON',
    'Commerce - SFDC Release & Platform - EUR',
  ),
  createResource(
    '30f361a9-25fc-42ce-a644-00e6e59399f5',
    'Ly HO',
    'Commerce - SFDC Technical Analyst - EUR',
  ),
  createResource(
    '7a1f984b-c5b3-4770-a2da-0d33915a80b2',
    'Mehdi KHADDOR',
    'Commerce - SFDC Technical Analyst - EUR',
  ),
  createResource(
    'f7419cc4-15cc-41a9-a28e-86f421dca915',
    'Mohamed-Amine BENAMAR',
    'Commerce - SFDC Developer - EUR',
  ),
  createResource(
    'b056e711-afae-48ba-84fb-cc2f7e33e83a',
    'Mohamed-Yassine NAOUM',
    'Commerce - SFDC Developer - EUR',
  ),
  createResource(
    '1f1e8d58-a7eb-4636-b40d-ebc18fbbd581',
    'Mustapha ELMADI',
    'Commerce - SFDC Developer - EUR',
  ),
  createResource(
    '4d9ae3a2-4f1c-4a8c-90c9-311fc112193f',
    'Nicolas FAURE',
    'Commerce - SFDC Developer - EUR',
  ),
  createResource(
    '6f939bdb-405d-414c-b462-bb8f55f061e3',
    'Paulo OLIVEIRA',
    'Commerce - SFDC Developer - EUR',
  ),
  createResource(
    'c5cda10e-71c5-4d71-a82d-90ced719d0f4',
    'Pavlo STRATOVYCH',
    'Commerce - SFDC Developer - EUR',
  ),
  createResource(
    'd80ca93c-15d5-4325-af71-95da5be9e550',
    'Salim SLAMI',
    'Commerce - SFDC Developer - EUR',
  ),
  createResource(
    '241f7789-0960-4f5f-8117-f9bcf37f93c9',
    'Sami IKHADALLEM',
    'Commerce - SFDC Technical Analyst - EUR',
  ),
  createResource(
    '4c0b340e-2897-4ff9-9e21-cd8e0fb4fa48',
    'Wanderson DANTAS',
    'Commerce - SFDC Developer - EUR',
  ),
  createResource(
    'a22cdd0c-910f-427e-89d6-19b6a5cefe4e',
    'Warda MANI',
    'Commerce - SFDC Developer - EUR',
  ),
  createResource(
    'fcb1e5e8-e065-4fec-a7d7-2753d7a4ad43',
    'Xavier MAMET',
    'Commerce - SFDC Developer - EUR',
  ),
  createResource(
    '1d81d9fd-f2c4-4e42-8247-c8dcf5906d82',
    'Zakaria IDER',
    'Commerce - SFDC Release & Platform - EUR',
  ),
];

export function createExistingImportBatch(overrides: Partial<ImportBatch> = {}): ImportBatch {
  return {
    id: '6b98fe6a-9b8e-4e79-abeb-0bb71659a263',
    importedAt: '2026-09-07T09:00:00.000Z',
    referenceDate: '2026-01-01',
    note: 'Previous baseline import',
    fileName: 'previous-import.xlsx',
    fileSha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    rowCount: 42,
    status: 'validated',
    createdAt: '2026-09-07T09:00:00.000Z',
    updatedAt: '2026-09-07T09:00:00.000Z',
    ...overrides,
  };
}
