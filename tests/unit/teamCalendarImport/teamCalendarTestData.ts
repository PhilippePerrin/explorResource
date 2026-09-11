import fs from 'node:fs';
import path from 'node:path';

import type { Resource } from '@/domain/entities';

export const TEAM_CALENDAR_FIXTURE_PATH = path.join(
  process.cwd(),
  'tests',
  'fixtures',
  'team-calendar.xlsx',
);

export function readTeamCalendarFixtureBuffer(): ArrayBuffer {
  const file = fs.readFileSync(TEAM_CALENDAR_FIXTURE_PATH);
  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
}

const RESOURCE_TYPE_ID = '2b973647-498d-4c42-8d90-71f668f30c2e';
const TIMESTAMP = '2026-09-08T10:00:00.000Z';

/** The 24 resource names that appear in the real tests/fixtures/team-calendar.xlsx. */
const FIXTURE_RESOURCE_NAMES: [firstName: string, lastName: string][] = [
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
  // Deliberately kept in the file's own (non-uppercase) casing to exercise the
  // case-and-accent-insensitive matching decided for this import.
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

export function buildFixtureResources(): Resource[] {
  return FIXTURE_RESOURCE_NAMES.map(([firstName, lastName], index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    firstName,
    lastName,
    resourceTypeId: RESOURCE_TYPE_ID,
    collaborationType: 'internal',
    status: 'active',
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  }));
}
