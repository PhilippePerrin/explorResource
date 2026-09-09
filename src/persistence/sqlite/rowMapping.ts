import { TABLE_DEFS, type StoreName } from './schema';

/** Converts a validated entity object into a flat SQL row (JSON-encoding non-scalar fields). */
export function entityToRow(
  storeName: StoreName,
  entity: Record<string, unknown>,
): Record<string, unknown> {
  const def = TABLE_DEFS[storeName];
  const row: Record<string, unknown> = {};

  for (const column of def.columns) {
    const value = entity[column.name];

    if (value === undefined) {
      row[column.name] = null;
      continue;
    }

    row[column.name] = column.json ? JSON.stringify(value) : value;
  }

  return row;
}

/**
 * Converts a raw SQL row back into an entity-shaped object (JSON-decoding
 * non-scalar fields). NULL columns are omitted entirely rather than mapped to
 * `null`/`undefined`, so Zod `.optional()`/`.default()` fields behave exactly
 * as they did when reading from IndexedDB (where the key was simply absent).
 */
export function rowToEntity(
  storeName: StoreName,
  row: Record<string, unknown>,
): Record<string, unknown> {
  const def = TABLE_DEFS[storeName];
  const entity: Record<string, unknown> = {};

  for (const column of def.columns) {
    const raw = row[column.name];

    if (raw === null || raw === undefined) {
      continue;
    }

    entity[column.name] = column.json ? JSON.parse(raw as string) : raw;
  }

  return entity;
}
