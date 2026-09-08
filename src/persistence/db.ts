import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction } from 'idb';

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

export const DATABASE_NAME = 'resource-capacity-project-demand-planner';
export const DB_VERSION = 1;

export const STORE_NAMES = [
  'appSettings',
  'companies',
  'resourceTypes',
  'resources',
  'releases',
  'projects',
  'groups',
  'projectReleases',
  'workingDaysCalendars',
  'resourceNonWorkingDays',
  'importBatches',
  'importRawRows',
  'demandSnapshots',
  'allocations',
  'changeSets',
  'auditEntries',
] as const;

export type StoreName = (typeof STORE_NAMES)[number];

export interface PlannerDB extends DBSchema {
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

type Migration = (
  db: IDBPDatabase<PlannerDB>,
  transaction: IDBPTransaction<PlannerDB, StoreName[], 'versionchange'>,
) => void;

type IndexDefinition = {
  name: string;
  keyPath: string | string[];
  options?: IDBIndexParameters;
};

function createStore(
  db: IDBPDatabase<PlannerDB>,
  storeName: StoreName,
  indexes: IndexDefinition[],
): void {
  const store = db.createObjectStore(storeName as never, { keyPath: 'id' });

  for (const index of indexes) {
    store.createIndex(index.name as never, index.keyPath, index.options);
  }
}

function createInitialSchema(db: IDBPDatabase<PlannerDB>): void {
  createStore(db, 'appSettings', [
    { name: 'by-schemaVersion', keyPath: 'schemaVersion' },
    { name: 'by-themePreference', keyPath: 'themePreference' },
  ]);
  createStore(db, 'companies', [
    { name: 'by-name', keyPath: 'name', options: { unique: true } },
    { name: 'by-status', keyPath: 'status' },
  ]);
  createStore(db, 'resourceTypes', [
    { name: 'by-label', keyPath: 'label', options: { unique: true } },
    { name: 'by-status', keyPath: 'status' },
    { name: 'by-displayOrder', keyPath: 'displayOrder' },
  ]);
  createStore(db, 'resources', [
    { name: 'by-resourceTypeId', keyPath: 'resourceTypeId' },
    { name: 'by-companyId', keyPath: 'companyId' },
    { name: 'by-collaborationType', keyPath: 'collaborationType' },
    { name: 'by-status', keyPath: 'status' },
    { name: 'by-lastName-firstName', keyPath: ['lastName', 'firstName'] },
  ]);
  createStore(db, 'releases', [
    { name: 'by-name', keyPath: 'name', options: { unique: true } },
    { name: 'by-status', keyPath: 'status' },
    { name: 'by-goLiveDate', keyPath: 'goLiveDate' },
  ]);
  createStore(db, 'projects', [
    { name: 'by-code', keyPath: 'code', options: { unique: true } },
    { name: 'by-name', keyPath: 'name' },
    { name: 'by-status', keyPath: 'status' },
  ]);
  createStore(db, 'groups', [
    { name: 'by-code', keyPath: 'code', options: { unique: true } },
    { name: 'by-label', keyPath: 'label' },
    { name: 'by-status', keyPath: 'status' },
  ]);
  createStore(db, 'projectReleases', [
    { name: 'by-projectId', keyPath: 'projectId' },
    { name: 'by-releaseId', keyPath: 'releaseId' },
    {
      name: 'by-projectId-releaseId',
      keyPath: ['projectId', 'releaseId'],
      options: { unique: true },
    },
  ]);
  createStore(db, 'workingDaysCalendars', [
    { name: 'by-year-month', keyPath: ['year', 'month'], options: { unique: true } },
    { name: 'by-year', keyPath: 'year' },
  ]);
  createStore(db, 'resourceNonWorkingDays', [
    { name: 'by-resourceId', keyPath: 'resourceId' },
    {
      name: 'by-resourceId-year-month',
      keyPath: ['resourceId', 'year', 'month'],
      options: { unique: true },
    },
    { name: 'by-year-month', keyPath: ['year', 'month'] },
  ]);
  createStore(db, 'importBatches', [
    { name: 'by-fileSha256', keyPath: 'fileSha256', options: { unique: true } },
    { name: 'by-status', keyPath: 'status' },
    { name: 'by-referenceDate', keyPath: 'referenceDate' },
    { name: 'by-importedAt', keyPath: 'importedAt' },
  ]);
  createStore(db, 'importRawRows', [
    { name: 'by-importBatchId', keyPath: 'importBatchId' },
    { name: 'by-classification', keyPath: 'classification' },
    {
      name: 'by-importBatchId-rowNumber',
      keyPath: ['importBatchId', 'rowNumber'],
      options: { unique: true },
    },
  ]);
  createStore(db, 'demandSnapshots', [
    { name: 'by-importBatchId', keyPath: 'importBatchId' },
    { name: 'by-projectCode', keyPath: 'projectCode' },
    { name: 'by-resourceTypeId', keyPath: 'resourceTypeId' },
    {
      name: 'by-projectCode-resourceTypeId-year-month-importBatchId',
      keyPath: ['projectCode', 'resourceTypeId', 'year', 'month', 'importBatchId'],
      options: { unique: true },
    },
  ]);
  createStore(db, 'allocations', [
    { name: 'by-resourceId', keyPath: 'resourceId' },
    { name: 'by-projectCode', keyPath: 'projectCode' },
    { name: 'by-resourceTypeId', keyPath: 'resourceTypeId' },
    {
      name: 'by-resourceId-year-month',
      keyPath: ['resourceId', 'year', 'month'],
    },
    {
      name: 'by-projectCode-resourceTypeId-year-month',
      keyPath: ['projectCode', 'resourceTypeId', 'year', 'month'],
    },
  ]);
  createStore(db, 'changeSets', [
    { name: 'by-entityType', keyPath: 'entityType' },
    { name: 'by-entityId', keyPath: 'entityId' },
    { name: 'by-timestamp', keyPath: 'timestamp' },
    { name: 'by-entityType-entityId', keyPath: ['entityType', 'entityId'] },
  ]);
  createStore(db, 'auditEntries', [
    { name: 'by-action', keyPath: 'action' },
    { name: 'by-timestamp', keyPath: 'timestamp' },
  ]);
}

// Add future migrations by bumping DB_VERSION and defining migrations[newVersion].
// Each migration should describe how to reach that exact version from the prior one.
export const migrations: Record<number, Migration> = {
  1: (db) => {
    createInitialSchema(db);
  },
};

const dbCache = new Map<string, Promise<IDBPDatabase<PlannerDB>>>();

export function openPlannerDb(databaseName = DATABASE_NAME): Promise<IDBPDatabase<PlannerDB>> {
  const cached = dbCache.get(databaseName);
  if (cached) {
    return cached;
  }

  const dbPromise = openDB<PlannerDB>(databaseName, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, transaction) {
      const targetVersion = newVersion ?? DB_VERSION;

      for (let version = oldVersion + 1; version <= targetVersion; version += 1) {
        const migration = migrations[version];

        if (!migration) {
          throw new Error(`Missing IndexedDB migration for version ${version}.`);
        }

        migration(db, transaction);
      }
    },
    blocked() {
      console.warn('IndexedDB upgrade is blocked by another open connection.');
    },
    blocking() {
      console.warn('Closing stale IndexedDB connection after a blocking upgrade request.');
    },
    terminated() {
      dbCache.delete(databaseName);
    },
  });

  dbCache.set(databaseName, dbPromise);
  return dbPromise;
}

export async function closePlannerDb(databaseName = DATABASE_NAME): Promise<void> {
  const dbPromise = dbCache.get(databaseName);

  if (!dbPromise) {
    return;
  }

  const db = await dbPromise;
  db.close();
  dbCache.delete(databaseName);
}

export async function deletePlannerDb(databaseName = DATABASE_NAME): Promise<void> {
  await closePlannerDb(databaseName);

  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName);

    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(
        new Error(`Unable to delete IndexedDB database "${databaseName}" because it is blocked.`),
      );
    request.onsuccess = () => resolve();
  });
}
