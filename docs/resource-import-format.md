---
title: Resource Import Format
id: resource-import-format
status: living
last_updated: 2026-09-09
---

# Resource Import Format

Based on real inspection of `data/export-resource.xlsx` (an "Availability list" export from the same
PSA/resource-management tool as the demand workbook, see `docs/import-format.md`). Sheet
`Availability list` (visible), sheet `plw-metadata` (hidden, 1 row, tool-internal — not used).

## Why this exists

The demand importer (`docs/import-format.md`) only _matches_ Resources/ResourceTypes by exact
`"Firstname LASTNAME"` / label — it never creates them. A fresh app therefore has no way to satisfy
that matching requirement except creating people one at a time via the manual `ResourcesPage` form.
This importer bulk-creates them from the matching Excel export, using the identical naming
convention, so the two files' names line up.

## Structure

A flattened tree, one row per node, no indentation column — hierarchy is inferred purely from row
content and order:

- **Header row** (row 2): `Resource | Quantity | Percentage | Start date | Finish date | File`.
- **Label rows** (column A only, columns B–F empty): company (`bioMérieux`), division (`Global IS`),
  sub-org (`Commerce`), then either:
  - an **organizational label** with 0 or 1 `" - "` separators (e.g. `Commerce - CRM FR`) — carries
    no data, always ignored;
  - a **resource-type header**: exactly two `" - "` separators (3 segments, e.g.
    `Commerce - SFDC Developer - EUR`), optionally prefixed `[Inactive Res.] `;
  - a **person-name row** (e.g. `Zakaria IDER`, `Mohamed-Amine BENAMAR`) — the authoritative,
    already-correctly-cased `"Firstname LASTNAME"` identity, appearing directly under a
    resource-type header.
- **Detail rows**: column A contains `/` (e.g. `Commerce - SFDC Developer - EUR/Zakaria.IDER`), plus
  Quantity/Percentage/Start date/Finish date/File on that row. The slash-path segment's casing is
  inconsistent (e.g. `Hassan.ALAMI MCHICHI` vs `Hassan.Alami`) and is **never** used for identity —
  only the preceding person-name label row is.

## Classification algorithm (no reliance on Excel outline levels or NO_IMPORT defined names)

Walk rows top-to-bottom from row 3, tracking `activeResourceTypeLabel` (set only by a real,
non-inactive-prefixed resource-type header) and `currentPersonName`:

1. Column A contains `/` → **detail row**. Attach to `currentPersonName` under
   `activeResourceTypeLabel`, unless the current person-block is flagged inactive (see below).
2. Column A has exactly two `" - "` separators (after stripping an optional `[Inactive Res.] `
   prefix) → **resource-type header**. If not inactive-prefixed, update
   `activeResourceTypeLabel` and stage the label as a new `ResourceType` if it isn't already known.
3. Otherwise, if a resource-type context exists → **person-name row**. Split on the first space:
   `firstName = tokens[0]`, `lastName = tokens.slice(1).join(' ')`.
4. Otherwise → **organizational row** (no data, never flagged).

Any row that cannot be classified with confidence (a detail row with no preceding type/person, a
person row with no following detail row, a person listed under two different active resource types)
is surfaced as an anomaly — never silently dropped or merged.

## `[Inactive Res.]` — a one-shot marker, not a persistent mode

**Confirmed on the real fixture**: `Hassan ALAMI` appears twice — once under the active
`Commerce - SFDC Release & Platform - EUR` header, and once under
`[Inactive Res.] Commerce - SFDC Release & Platform - EUR` for an ended assignment (different
Finish date). Immediately after that inactive block, the listing resumes with more currently-active
people (`Laura PICHON`, `Zakaria IDER`) under the _original_ active header — with no new header row
in between.

This means the inactive marker only affects the **single person-block immediately following it**
(that one person-name row plus all of its contiguous detail rows). It must never be treated as
switching the active resource type for the rest of the file — doing so was an early implementation
bug (regression-tested in `tests/unit/resourceImport/parse.test.ts`, the
`"never persists an [Inactive Res.] header past the single block that follows it"` case) that
silently dropped every person listed after an inactive marker.

Implementation: an inactive header sets a one-shot `pendingInactiveHeader` flag; the very next
person row captures it into `currentPersonBlockInactive` (used for all of that person's detail
rows) and clears the flag immediately, so the next person row defaults back to active unless another
inactive header immediately precedes it.

## Matching, creation, and update rules

- Matching key: exact `getResourceFullName(resource).trim()` — the identical convention and
  exact-match semantics used by the demand importer, so names line up between the two files.
- No match → stage as `action: 'create'`, `collaborationType: 'internal'`, no `companyId`,
  `status: 'active'`. `Resource.startDate`/`endDate` are intentionally **not** imported in this
  version (not read by any capacity calculation today, and the file's per-row Start/Finish dates
  describe time-boxed assignment periods that don't map 1:1 onto a single Resource-level pair).
- Match with the same resource type → `action: 'unchanged'`, no write.
- Match with a different resource type → staged as `action: 'update'`; the commit step re-checks
  against a fresh read of `allocations` and only applies the type change if the resource has none
  yet (the existing `resourceUtils.ts` rule already forbids changing type in place once allocations
  exist). If unsafe, the change is skipped and reported (`skippedTypeChanges`) — never forced,
  never silently dropped.
- A previously-active resource no longer listed under any active resource type in a re-imported
  file is reported (`noLongerListed`) but **never auto-archived** — archiving stays a manual
  `ResourcesPage` action (hard rule: no silent data deletion).
- Unknown resource-type labels are staged as new active `ResourceType`s and shown in the preview
  before commit — never created silently.

## Duplicate detection

Same mechanism as the demand importer: SHA-256 of the raw file bytes compared against all existing
`ImportBatch.fileSha256` values (shared store — see `ImportBatch.kind` below).

## Persistence

Reuses the existing `resourceTypes`, `resources`, and `importBatches` tables — no schema
migration was needed. `ImportBatch` gained an additive `kind: 'demand' | 'resource'` field
(`.default('demand')`, so every pre-existing batch resolves to `'demand'` with no migration) purely
to keep the two importers' history/comparison views from mixing; this importer does not persist
`ImportRawRow` records (the created/updated Resource records themselves are the audit trail).

## Wizard steps

1. File selection → 2. Preview (staged types/resources, `[Inactive Res.]` skip count, no-longer-listed
   list) → 3. Anomaly review → 4. Commit (atomic transaction) → 5. Final report (downloadable
   Markdown).
