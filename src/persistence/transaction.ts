import { openPlannerDb, type StoreName } from './db';
import { withWriteErrorHandling } from './repository';
import type { SqliteWriteOp } from './sqlite/types';

/**
 * Applies a flat list of pre-validated writes atomically (all-or-nothing).
 * Replaces the raw `idb` multi-store transactions previously hand-rolled in
 * src/import/commit.ts, src/resourceImport/commit.ts, src/import/comparison.ts,
 * and src/persistence/backup.ts. Every value in `ops` must already have been
 * validated by the caller (via validateStoreValue) before being included here.
 */
export async function runTransaction(
  primaryStoreName: StoreName,
  action: string,
  ops: SqliteWriteOp[],
): Promise<void> {
  const db = await openPlannerDb();
  await withWriteErrorHandling(primaryStoreName, action, () => db.runTransaction(ops));
}
