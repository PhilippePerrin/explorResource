import type {
  Allocation,
  AppSettings,
  AuditEntry,
  ChangeSet,
  Company,
  DemandSnapshot,
  Group,
  ImportBatch,
  ImportRawRow,
  Project,
  ProjectRelease,
  Release,
  Resource,
  ResourceNonWorkingDays,
  ResourceType,
  WorkingDaysCalendar,
} from '@/domain/entities';

import { SCHEMA_VERSION } from './sqlite/migrations';
import { createDirectSqliteClient } from './sqlite/directDriver';
import { createSqliteWorkerClient } from './sqlite/workerClient';
import { DATABASE_NAME, STORE_NAMES, type StoreName } from './sqlite/schema';
import type { SqliteClient } from './sqlite/types';

export { DATABASE_NAME, STORE_NAMES, type StoreName };
export const DB_VERSION = SCHEMA_VERSION;

// Kept as a plain TypeScript shape (not tied to any storage engine's own
// typing) so the ~60 createRepository() call sites across src/features/* keep
// compiling unchanged after the IndexedDB -> SQLite migration.
export interface PlannerDB {
  appSettings: {
    key: AppSettings['id'];
    value: AppSettings;
    indexes: {
      'by-schemaVersion': AppSettings['schemaVersion'];
      'by-themePreference': AppSettings['themePreference'];
    };
  };
  companies: {
    key: Company['id'];
    value: Company;
    indexes: {
      'by-name': Company['name'];
      'by-status': Company['status'];
    };
  };
  resourceTypes: {
    key: ResourceType['id'];
    value: ResourceType;
    indexes: {
      'by-label': ResourceType['label'];
      'by-status': ResourceType['status'];
      'by-displayOrder': ResourceType['displayOrder'];
    };
  };
  resources: {
    key: Resource['id'];
    value: Resource;
    indexes: {
      'by-resourceTypeId': Resource['resourceTypeId'];
      'by-companyId': string;
      'by-collaborationType': Resource['collaborationType'];
      'by-status': Resource['status'];
      'by-lastName-firstName': [Resource['lastName'], Resource['firstName']];
    };
  };
  releases: {
    key: Release['id'];
    value: Release;
    indexes: {
      'by-name': Release['name'];
      'by-status': Release['status'];
      'by-goLiveDate': Release['goLiveDate'];
    };
  };
  projects: {
    key: Project['id'];
    value: Project;
    indexes: {
      'by-code': Project['code'];
      'by-name': Project['name'];
      'by-status': Project['status'];
    };
  };
  groups: {
    key: Group['id'];
    value: Group;
    indexes: {
      'by-code': Group['code'];
      'by-label': Group['label'];
      'by-status': Group['status'];
    };
  };
  projectReleases: {
    key: ProjectRelease['id'];
    value: ProjectRelease;
    indexes: {
      'by-projectId': ProjectRelease['projectId'];
      'by-releaseId': ProjectRelease['releaseId'];
      'by-projectId-releaseId': [ProjectRelease['projectId'], ProjectRelease['releaseId']];
    };
  };
  workingDaysCalendars: {
    key: WorkingDaysCalendar['id'];
    value: WorkingDaysCalendar;
    indexes: {
      'by-year-month': [WorkingDaysCalendar['year'], WorkingDaysCalendar['month']];
      'by-year': WorkingDaysCalendar['year'];
    };
  };
  resourceNonWorkingDays: {
    key: ResourceNonWorkingDays['id'];
    value: ResourceNonWorkingDays;
    indexes: {
      'by-resourceId': ResourceNonWorkingDays['resourceId'];
      'by-resourceId-year-month': [
        ResourceNonWorkingDays['resourceId'],
        ResourceNonWorkingDays['year'],
        ResourceNonWorkingDays['month'],
      ];
      'by-year-month': [ResourceNonWorkingDays['year'], ResourceNonWorkingDays['month']];
    };
  };
  importBatches: {
    key: ImportBatch['id'];
    value: ImportBatch;
    indexes: {
      'by-fileSha256': ImportBatch['fileSha256'];
      'by-status': ImportBatch['status'];
      'by-referenceDate': ImportBatch['referenceDate'];
      'by-importedAt': ImportBatch['importedAt'];
    };
  };
  importRawRows: {
    key: ImportRawRow['id'];
    value: ImportRawRow;
    indexes: {
      'by-importBatchId': ImportRawRow['importBatchId'];
      'by-classification': ImportRawRow['classification'];
      'by-importBatchId-rowNumber': [ImportRawRow['importBatchId'], ImportRawRow['rowNumber']];
    };
  };
  demandSnapshots: {
    key: DemandSnapshot['id'];
    value: DemandSnapshot;
    indexes: {
      'by-importBatchId': string;
      'by-projectCode': DemandSnapshot['projectCode'];
      'by-resourceTypeId': DemandSnapshot['resourceTypeId'];
      'by-projectCode-resourceTypeId-year-month-importBatchId': [
        DemandSnapshot['projectCode'],
        DemandSnapshot['resourceTypeId'],
        DemandSnapshot['year'],
        DemandSnapshot['month'],
        string,
      ];
    };
  };
  allocations: {
    key: Allocation['id'];
    value: Allocation;
    indexes: {
      'by-resourceId': Allocation['resourceId'];
      'by-projectCode': Allocation['projectCode'];
      'by-resourceTypeId': Allocation['resourceTypeId'];
      'by-resourceId-year-month': [
        Allocation['resourceId'],
        Allocation['year'],
        Allocation['month'],
      ];
      'by-projectCode-resourceTypeId-year-month': [
        Allocation['projectCode'],
        Allocation['resourceTypeId'],
        Allocation['year'],
        Allocation['month'],
      ];
    };
  };
  changeSets: {
    key: ChangeSet['id'];
    value: ChangeSet;
    indexes: {
      'by-entityType': ChangeSet['entityType'];
      'by-entityId': ChangeSet['entityId'];
      'by-timestamp': ChangeSet['timestamp'];
      'by-entityType-entityId': [ChangeSet['entityType'], ChangeSet['entityId']];
    };
  };
  auditEntries: {
    key: AuditEntry['id'];
    value: AuditEntry;
    indexes: {
      'by-action': AuditEntry['action'];
      'by-timestamp': AuditEntry['timestamp'];
    };
  };
}

// OPFS SyncAccessHandles (and therefore the production Worker/sahpool client)
// are not reliably available under Vitest's jsdom environment, so tests use
// an in-memory, same-thread client instead. Overridable via
// __setSqliteClientFactoryForTests (tests/unit/setup.ts) for full isolation
// between test files/cases.
function defaultClientFactory(): Promise<SqliteClient> {
  if (import.meta.env.MODE === 'test' || typeof Worker === 'undefined') {
    return createDirectSqliteClient();
  }

  return Promise.resolve(createSqliteWorkerClient());
}

let clientFactory: () => Promise<SqliteClient> = defaultClientFactory;
let clientPromise: Promise<SqliteClient> | null = null;

export function openPlannerDb(): Promise<SqliteClient> {
  if (!clientPromise) {
    clientPromise = clientFactory().catch((error: unknown) => {
      clientPromise = null;
      throw error;
    });
  }

  return clientPromise;
}

export function closePlannerDb(): void {
  clientPromise = null;
}

/** Test-only: forces the next openPlannerDb() to build a fresh client from `factory`. */
export function __setSqliteClientFactoryForTests(factory: () => Promise<SqliteClient>): void {
  clientFactory = factory;
  clientPromise = null;
}

// Wipes every row from every table rather than tearing down the underlying
// OPFS file/VFS: the production database only ever has one live connection
// (held by the dedicated Worker), so deleting the OPFS directory from the
// main thread would race that connection's open SyncAccessHandles. Clearing
// in place is simpler, avoids that race entirely, and is behaviorally
// equivalent for the "controlled data wipe" flow in Settings.
export async function deletePlannerDb(): Promise<void> {
  const client = await openPlannerDb();
  await client.runTransaction(STORE_NAMES.map((store) => ({ store, op: 'clear' as const })));
}
