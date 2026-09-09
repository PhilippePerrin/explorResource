export const DATABASE_NAME = 'resource-capacity-project-demand-planner';
export const OPFS_DATABASE_FILENAME = '/planner.sqlite3';

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

export type SqlColumnType = 'TEXT' | 'INTEGER' | 'REAL';

export interface ColumnDef {
  name: string;
  sqlType: SqlColumnType;
  /** Non-scalar (object/array/union) fields are stored as JSON text. */
  json?: boolean;
}

export interface IndexDef {
  name: string;
  columns: string[];
  unique?: boolean;
}

export interface TableDef {
  table: StoreName;
  columns: ColumnDef[];
  indexes: IndexDef[];
}

function col(name: string, sqlType: SqlColumnType, json?: boolean): ColumnDef {
  return json ? { name, sqlType, json: true } : { name, sqlType };
}

// One entry per IndexedDB store from the previous schema (src/persistence/db.ts,
// now superseded). Column lists are derived from the Zod schemas in
// src/domain/entities/ (the authoritative shape); index definitions mirror the
// old IDB index set 1:1 so query behavior (including which lookups are unique)
// carries over unchanged.
export const TABLE_DEFS: Record<StoreName, TableDef> = {
  appSettings: {
    table: 'appSettings',
    columns: [
      col('id', 'TEXT'),
      col('displayPrecision', 'INTEGER'),
      col('visualThresholds', 'TEXT', true),
      col('numericTolerance', 'REAL'),
      col('themePreference', 'TEXT'),
      col('backupFormatVersion', 'INTEGER'),
      col('schemaVersion', 'INTEGER'),
    ],
    indexes: [
      { name: 'by-schemaVersion', columns: ['schemaVersion'] },
      { name: 'by-themePreference', columns: ['themePreference'] },
    ],
  },
  companies: {
    table: 'companies',
    columns: [
      col('id', 'TEXT'),
      col('name', 'TEXT'),
      col('status', 'TEXT'),
      col('createdAt', 'TEXT'),
      col('updatedAt', 'TEXT'),
    ],
    indexes: [
      { name: 'by-name', columns: ['name'], unique: true },
      { name: 'by-status', columns: ['status'] },
    ],
  },
  resourceTypes: {
    table: 'resourceTypes',
    columns: [
      col('id', 'TEXT'),
      col('label', 'TEXT'),
      col('shortCode', 'TEXT'),
      col('color', 'TEXT'),
      col('status', 'TEXT'),
      col('displayOrder', 'INTEGER'),
      col('createdAt', 'TEXT'),
      col('updatedAt', 'TEXT'),
    ],
    indexes: [
      { name: 'by-label', columns: ['label'], unique: true },
      { name: 'by-status', columns: ['status'] },
      { name: 'by-displayOrder', columns: ['displayOrder'] },
    ],
  },
  resources: {
    table: 'resources',
    columns: [
      col('id', 'TEXT'),
      col('firstName', 'TEXT'),
      col('lastName', 'TEXT'),
      col('resourceTypeId', 'TEXT'),
      col('collaborationType', 'TEXT'),
      col('companyId', 'TEXT'),
      col('startDate', 'TEXT'),
      col('endDate', 'TEXT'),
      col('status', 'TEXT'),
      col('createdAt', 'TEXT'),
      col('updatedAt', 'TEXT'),
    ],
    indexes: [
      { name: 'by-resourceTypeId', columns: ['resourceTypeId'] },
      { name: 'by-companyId', columns: ['companyId'] },
      { name: 'by-collaborationType', columns: ['collaborationType'] },
      { name: 'by-status', columns: ['status'] },
      { name: 'by-lastName-firstName', columns: ['lastName', 'firstName'] },
    ],
  },
  releases: {
    table: 'releases',
    columns: [
      col('id', 'TEXT'),
      col('name', 'TEXT'),
      col('goLiveDate', 'TEXT'),
      col('color', 'TEXT'),
      col('status', 'TEXT'),
      col('createdAt', 'TEXT'),
      col('updatedAt', 'TEXT'),
    ],
    indexes: [
      { name: 'by-name', columns: ['name'], unique: true },
      { name: 'by-status', columns: ['status'] },
      { name: 'by-goLiveDate', columns: ['goLiveDate'] },
    ],
  },
  projects: {
    table: 'projects',
    columns: [
      col('id', 'TEXT'),
      col('code', 'TEXT'),
      col('name', 'TEXT'),
      col('status', 'TEXT'),
      col('createdAt', 'TEXT'),
      col('updatedAt', 'TEXT'),
    ],
    indexes: [
      { name: 'by-code', columns: ['code'], unique: true },
      { name: 'by-name', columns: ['name'] },
      { name: 'by-status', columns: ['status'] },
    ],
  },
  groups: {
    table: 'groups',
    columns: [
      col('id', 'TEXT'),
      col('code', 'TEXT'),
      col('label', 'TEXT'),
      col('status', 'TEXT'),
      col('createdAt', 'TEXT'),
      col('updatedAt', 'TEXT'),
    ],
    indexes: [
      { name: 'by-code', columns: ['code'], unique: true },
      { name: 'by-label', columns: ['label'] },
      { name: 'by-status', columns: ['status'] },
    ],
  },
  projectReleases: {
    table: 'projectReleases',
    columns: [
      col('id', 'TEXT'),
      col('projectId', 'TEXT'),
      col('releaseId', 'TEXT'),
      col('createdAt', 'TEXT'),
      col('updatedAt', 'TEXT'),
    ],
    indexes: [
      { name: 'by-projectId', columns: ['projectId'] },
      { name: 'by-releaseId', columns: ['releaseId'] },
      { name: 'by-projectId-releaseId', columns: ['projectId', 'releaseId'], unique: true },
    ],
  },
  workingDaysCalendars: {
    table: 'workingDaysCalendars',
    columns: [
      col('id', 'TEXT'),
      col('year', 'INTEGER'),
      col('month', 'INTEGER'),
      col('workingDaysCount', 'REAL'),
      col('createdAt', 'TEXT'),
      col('updatedAt', 'TEXT'),
    ],
    indexes: [
      { name: 'by-year-month', columns: ['year', 'month'], unique: true },
      { name: 'by-year', columns: ['year'] },
    ],
  },
  resourceNonWorkingDays: {
    table: 'resourceNonWorkingDays',
    columns: [
      col('id', 'TEXT'),
      col('resourceId', 'TEXT'),
      col('year', 'INTEGER'),
      col('month', 'INTEGER'),
      col('days', 'REAL'),
      col('createdAt', 'TEXT'),
      col('updatedAt', 'TEXT'),
    ],
    indexes: [
      { name: 'by-resourceId', columns: ['resourceId'] },
      {
        name: 'by-resourceId-year-month',
        columns: ['resourceId', 'year', 'month'],
        unique: true,
      },
      { name: 'by-year-month', columns: ['year', 'month'] },
    ],
  },
  importBatches: {
    table: 'importBatches',
    columns: [
      col('id', 'TEXT'),
      col('importedAt', 'TEXT'),
      col('referenceDate', 'TEXT'),
      col('note', 'TEXT'),
      col('fileName', 'TEXT'),
      col('fileSha256', 'TEXT'),
      col('rowCount', 'INTEGER'),
      col('status', 'TEXT'),
      col('kind', 'TEXT'),
      col('createdAt', 'TEXT'),
      col('updatedAt', 'TEXT'),
    ],
    indexes: [
      { name: 'by-fileSha256', columns: ['fileSha256'], unique: true },
      { name: 'by-status', columns: ['status'] },
      { name: 'by-referenceDate', columns: ['referenceDate'] },
      { name: 'by-importedAt', columns: ['importedAt'] },
    ],
  },
  importRawRows: {
    table: 'importRawRows',
    columns: [
      col('id', 'TEXT'),
      col('importBatchId', 'TEXT'),
      col('rowNumber', 'INTEGER'),
      col('rawCells', 'TEXT', true),
      col('classification', 'TEXT'),
      col('classificationConfidence', 'TEXT', true),
      col('anomalyNotes', 'TEXT', true),
      col('createdAt', 'TEXT'),
      col('updatedAt', 'TEXT'),
    ],
    indexes: [
      { name: 'by-importBatchId', columns: ['importBatchId'] },
      { name: 'by-classification', columns: ['classification'] },
      {
        name: 'by-importBatchId-rowNumber',
        columns: ['importBatchId', 'rowNumber'],
        unique: true,
      },
    ],
  },
  demandSnapshots: {
    table: 'demandSnapshots',
    columns: [
      col('id', 'TEXT'),
      col('importBatchId', 'TEXT'),
      col('projectCode', 'TEXT'),
      col('resourceTypeId', 'TEXT'),
      col('year', 'INTEGER'),
      col('month', 'INTEGER'),
      col('demandDays', 'REAL'),
      col('supplyDays', 'REAL'),
      col('origin', 'TEXT'),
      col('createdAt', 'TEXT'),
      col('updatedAt', 'TEXT'),
    ],
    indexes: [
      { name: 'by-importBatchId', columns: ['importBatchId'] },
      { name: 'by-projectCode', columns: ['projectCode'] },
      { name: 'by-resourceTypeId', columns: ['resourceTypeId'] },
      {
        name: 'by-projectCode-resourceTypeId-year-month-importBatchId',
        columns: ['projectCode', 'resourceTypeId', 'year', 'month', 'importBatchId'],
        unique: true,
      },
    ],
  },
  allocations: {
    table: 'allocations',
    columns: [
      col('id', 'TEXT'),
      col('resourceId', 'TEXT'),
      col('projectCode', 'TEXT'),
      col('resourceTypeId', 'TEXT'),
      col('year', 'INTEGER'),
      col('month', 'INTEGER'),
      col('allocatedDays', 'REAL'),
      col('origin', 'TEXT'),
      col('createdAt', 'TEXT'),
      col('updatedAt', 'TEXT'),
    ],
    indexes: [
      { name: 'by-resourceId', columns: ['resourceId'] },
      { name: 'by-projectCode', columns: ['projectCode'] },
      { name: 'by-resourceTypeId', columns: ['resourceTypeId'] },
      { name: 'by-resourceId-year-month', columns: ['resourceId', 'year', 'month'] },
      {
        name: 'by-projectCode-resourceTypeId-year-month',
        columns: ['projectCode', 'resourceTypeId', 'year', 'month'],
      },
    ],
  },
  changeSets: {
    table: 'changeSets',
    columns: [
      col('id', 'TEXT'),
      col('entityType', 'TEXT'),
      col('entityId', 'TEXT'),
      col('changeType', 'TEXT'),
      col('before', 'TEXT', true),
      col('after', 'TEXT', true),
      col('timestamp', 'TEXT'),
    ],
    indexes: [
      { name: 'by-entityType', columns: ['entityType'] },
      { name: 'by-entityId', columns: ['entityId'] },
      { name: 'by-timestamp', columns: ['timestamp'] },
      { name: 'by-entityType-entityId', columns: ['entityType', 'entityId'] },
    ],
  },
  auditEntries: {
    table: 'auditEntries',
    columns: [
      col('id', 'TEXT'),
      col('action', 'TEXT'),
      col('details', 'TEXT', true),
      col('timestamp', 'TEXT'),
    ],
    indexes: [
      { name: 'by-action', columns: ['action'] },
      { name: 'by-timestamp', columns: ['timestamp'] },
    ],
  },
};

function quoteIdentifier(name: string): string {
  return `"${name}"`;
}

export function buildSchemaStatements(): string[] {
  const statements: string[] = [];

  for (const storeName of STORE_NAMES) {
    const def = TABLE_DEFS[storeName];
    const columnDefinitions = def.columns
      .map((column) => {
        const primaryKey = column.name === 'id' ? ' PRIMARY KEY' : '';
        return `${quoteIdentifier(column.name)} ${column.sqlType}${primaryKey}`;
      })
      .join(', ');

    statements.push(`CREATE TABLE ${quoteIdentifier(def.table)} (${columnDefinitions})`);

    for (const index of def.indexes) {
      const unique = index.unique ? 'UNIQUE ' : '';
      const indexName = `${def.table}_${index.name}`;
      const indexColumns = index.columns.map(quoteIdentifier).join(', ');
      statements.push(
        `CREATE ${unique}INDEX ${quoteIdentifier(indexName)} ON ${quoteIdentifier(def.table)} (${indexColumns})`,
      );
    }
  }

  return statements;
}
