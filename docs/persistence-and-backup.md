---
title: Persistence & Backup
id: persistence-and-backup
status: living
last_updated: 2026-09-10
---

# Persistence & Backup

## Source of truth

SQLite, compiled to WebAssembly (`@sqlite.org/sqlite-wasm`) and persisted via the OPFS SyncAccessHandle Pool VFS, accessed exclusively through a validated repository layer (`src/persistence/`). Every write is validated against the entity's Zod schema before being committed; reads may also be validated to catch corruption early.

The database connection is held inside a dedicated Worker (`src/workers/sqlite.worker.ts`) — OPFS SyncAccessHandles are only obtainable in a Worker context — and the main thread talks to it via a postMessage RPC client (`src/persistence/sqlite/workerClient.ts`). Unit tests run the identical SQL against an in-memory, same-thread instance instead (`src/persistence/sqlite/directDriver.ts`), since jsdom cannot reliably host a real dedicated Worker with sync file-system handles.

**Only one connection can hold the database at a time.** If the app is already open in another tab or window, opening it here fails; `src/app/DatabaseLockGuard.tsx` detects that and shows a clear message with a reload button rather than letting every page fail silently. This app remains single-user, single-machine by design — no multi-tab sync was built.

## Migrations

Schema version is tracked via `PRAGMA user_version`, a single incrementing integer. Each version bump is one additive migration function (never destructive without an explicit user-facing backup prompt first). See the header comment in `src/persistence/sqlite/migrations.ts` for the exact pattern to follow when adding a new migration.

## Backup (critical, non-optional feature)

- **Export**: full JSON dump of every table, wrapped in an envelope `{ backupFormatVersion, exportedAt, schemaVersion, data: { ...perStoreArrays } }`.
- **Restore**: validated against the envelope + per-entity Zod schemas before anything is written; applied inside a **single atomic SQL transaction** (`src/persistence/transaction.ts`'s `runTransaction`, real `BEGIN`/`COMMIT`/`ROLLBACK`) spanning all tables — a corrupt/invalid backup must never partially apply.
- **Versioning**: `backupFormatVersion` (currently `2`, bumped from `1` when SQLite replaced IndexedDB — the JSON shape didn't change, but a pre-migration backup and a post-migration backup must never be mistaken for the same schema generation) is independent from the storage engine's own `schemaVersion`; a mismatch is a clear, typed error, not a silent best-effort import.
- **Reset**: full data wipe requires double confirmation. Implemented by clearing every table in one transaction (`deletePlannerDb()`), not by deleting the underlying database file — that avoids racing the Worker's open OPFS handles.
- **Quota/write errors**: surfaced as typed errors (`PersistenceWriteError`) with a human-readable message; no silent data loss. SQLite result codes (`SQLITE_FULL`, `SQLITE_CONSTRAINT`, `SQLITE_BUSY`/`SQLITE_LOCKED`) are translated in `src/persistence/repository.ts`.

Lot 11's Settings UI reuses `src/persistence/backup.ts` directly for export, validation, and restore. No parallel JSON import/export implementation is allowed in feature code.

## Unsaved changes

The UI must track a dirty/unsaved-changes flag and warn before navigation/close (`beforeunload`) whenever there are unsaved changes — implemented in the relevant feature lots (Non-working Days, Allocation Studio, Settings thresholds, etc.), backed by this persistence layer's explicit-save model (no auto-save assumed unless a feature says otherwise).

## No network transmission

No business data is ever sent over the network. This app makes no calls to any backend for business data (confirmed architectural constraint, see `AGENTS.md` §3).
