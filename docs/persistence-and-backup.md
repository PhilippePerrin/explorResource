---
title: Persistence & Backup
id: persistence-and-backup
status: living
last_updated: 2026-09-08
---

# Persistence & Backup

## Source of truth

IndexedDB, accessed exclusively through a validated repository layer (`src/persistence/`). Every write is validated against the entity's Zod schema before being committed; reads may also be validated to catch corruption early.

## Migrations

Schema version is a single incrementing integer. Each version bump is one additive migration function (never destructive without an explicit user-facing backup prompt first). See the header comment in `src/persistence/db.ts` for the exact pattern to follow when adding a new migration.

## Backup (critical, non-optional feature)

- **Export**: full JSON dump of every object store, wrapped in an envelope `{ backupFormatVersion, exportedAt, schemaVersion, data: { ...perStoreArrays } }`.
- **Restore**: validated against the envelope + per-entity Zod schemas before anything is written; applied inside a **single atomic IndexedDB transaction** spanning all stores — a corrupt/invalid backup must never partially apply.
- **Versioning**: `backupFormatVersion` is independent from the IndexedDB `schemaVersion`; a mismatch is a clear, typed error, not a silent best-effort import.
- **Reset**: full data wipe requires double confirmation.
- **Quota/write errors**: surfaced as typed errors (`PersistenceWriteError`) with a human-readable message; no silent data loss.

Lot 11's Settings UI reuses `src/persistence/backup.ts` directly for export, validation, and restore. No parallel JSON import/export implementation is allowed in feature code.

## Unsaved changes

The UI must track a dirty/unsaved-changes flag and warn before navigation/close (`beforeunload`) whenever there are unsaved changes — implemented in the relevant feature lots (Non-working Days, Allocation Studio, Settings thresholds, etc.), backed by this persistence layer's explicit-save model (no auto-save assumed unless a feature says otherwise).

## No network transmission

No business data is ever sent over the network. This app makes no calls to any backend for business data (confirmed architectural constraint, see `AGENTS.md` §3).
