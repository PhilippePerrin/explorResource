import type { BindableValue, Database } from '@sqlite.org/sqlite-wasm';

import { TABLE_DEFS, type StoreName } from './schema';
import { entityToRow, rowToEntity } from './rowMapping';
import type { IndexQuery } from './types';

function quoteIdentifier(name: string): string {
  return `"${name}"`;
}

// Every value we bind is already scalar (string/number/null) after
// entityToRow/JSON-encoding — the wasm binding's own runtime checks reject
// anything else, so a type-level cast here is sound.
function toBind(values: unknown[]): BindableValue[] {
  return values as BindableValue[];
}

function findIndex(storeName: StoreName, indexName: string) {
  const index = TABLE_DEFS[storeName].indexes.find((candidate) => candidate.name === indexName);

  if (!index) {
    throw new Error(`Unknown index "${indexName}" for store "${storeName}".`);
  }

  return index;
}

export function selectAll(db: Database, storeName: StoreName): Record<string, unknown>[] {
  const rows = db.selectObjects(`SELECT * FROM ${quoteIdentifier(storeName)}`) as Record<
    string,
    unknown
  >[];
  return rows.map((row) => rowToEntity(storeName, row));
}

export function selectById(
  db: Database,
  storeName: StoreName,
  id: unknown,
): Record<string, unknown> | undefined {
  const rows = db.selectObjects(
    `SELECT * FROM ${quoteIdentifier(storeName)} WHERE id = ?`,
    toBind([id]),
  ) as Record<string, unknown>[];
  return rows[0] ? rowToEntity(storeName, rows[0]) : undefined;
}

export function selectByIndex(
  db: Database,
  storeName: StoreName,
  indexName: string,
  query: IndexQuery,
): Record<string, unknown>[] {
  const index = findIndex(storeName, indexName);
  const table = quoteIdentifier(storeName);
  const columns = index.columns.map(quoteIdentifier);

  if (typeof query === 'object' && !Array.isArray(query)) {
    // Inclusive lexicographic bound over the composite key, matching
    // IDBKeyRange.bound([...]) semantics via SQLite row-value comparison.
    const tuple = `(${columns.join(', ')})`;
    const fromPlaceholders = index.columns.map(() => '?').join(', ');
    const toPlaceholders = index.columns.map(() => '?').join(', ');
    const sql = `SELECT * FROM ${table} WHERE ${tuple} >= (${fromPlaceholders}) AND ${tuple} <= (${toPlaceholders})`;
    const rows = db.selectObjects(sql, toBind([...query.from, ...query.to])) as Record<
      string,
      unknown
    >[];
    return rows.map((row) => rowToEntity(storeName, row));
  }

  const values = Array.isArray(query) ? query : [query];
  const whereClause = columns.map((column) => `${column} = ?`).join(' AND ');
  const sql = `SELECT * FROM ${table} WHERE ${whereClause}`;
  const rows = db.selectObjects(sql, toBind(values)) as Record<string, unknown>[];
  return rows.map((row) => rowToEntity(storeName, row));
}

export function upsert(db: Database, storeName: StoreName, value: Record<string, unknown>): void {
  const def = TABLE_DEFS[storeName];
  const row = entityToRow(storeName, value);
  const columnNames = def.columns.map((column) => column.name);
  const quotedColumns = columnNames.map(quoteIdentifier);
  const placeholders = columnNames.map(() => '?').join(', ');
  const updateAssignments = columnNames
    .filter((column) => column !== 'id')
    .map((column) => `${quoteIdentifier(column)} = excluded.${quoteIdentifier(column)}`)
    .join(', ');

  const sql = `INSERT INTO ${quoteIdentifier(storeName)} (${quotedColumns.join(', ')}) VALUES (${placeholders})
    ON CONFLICT(${quoteIdentifier('id')}) DO UPDATE SET ${updateAssignments}`;

  db.exec({ sql, bind: toBind(columnNames.map((column) => row[column])) });
}

export function remove(db: Database, storeName: StoreName, id: unknown): void {
  db.exec({
    sql: `DELETE FROM ${quoteIdentifier(storeName)} WHERE id = ?`,
    bind: toBind([id]),
  });
}

export function clearStore(db: Database, storeName: StoreName): void {
  db.exec(`DELETE FROM ${quoteIdentifier(storeName)}`);
}
