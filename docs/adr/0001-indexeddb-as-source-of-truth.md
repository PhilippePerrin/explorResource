---
title: 'ADR-0001: IndexedDB as source of truth, JSON as backup format'
id: adr-0001
status: accepted
date: 2026-09-08
---

# ADR-0001: IndexedDB as source of truth, JSON as backup format

## Context

The original requirement stated "sauvegarder en local dans fichier JSON" (save locally to a JSON file), while also requiring: fluid performance with several years of data, several hundred projects, several thousand allocations, and tens of thousands of monthly values, plus indexed lookups, migrations, and atomic writes.

A single JSON file as the _primary_ read/write store does not support indexed queries, partial writes, or transactional guarantees, and would require full-file read/write/parse on every change — unworkable at the stated volumetry.

## Decision

- **IndexedDB** (via the `idb` wrapper) is the source of truth for all business data, with per-entity object stores, secondary indexes on functional/logical keys, and versioned migrations.
- **JSON** is used exclusively as the **export/backup and restore format** — satisfying the "critical, non-optional backup" requirement and the original wording's intent (a portable, human-inspectable local file) without constraining runtime storage.

## Consequences

- Backup export/import must stay perfectly round-trippable and schema-validated (see `docs/persistence-and-backup.md`).
- A `backupFormatVersion` is tracked independently from the IndexedDB `schemaVersion`.
- Restoring a backup must be atomic (single transaction across all stores) to avoid partial application of a corrupt file.

## Alternatives considered

- **Single JSON file as primary store** (rejected: no indexing, no partial writes, poor performance at scale).
- **SQLite via WASM (e.g. `sql.js`, `wa-sqlite`)** (rejected for v1: adds a heavier dependency and a WASM asset pipeline for GitHub Pages, without a clear benefit over IndexedDB's native indexing for this data shape; may be revisited if relational query complexity grows).
