---
title: Functional Specification
id: functional-specification
status: living
last_updated: 2026-09-09
---

# Functional Specification

## Pages

1. **Dashboard** — net capacity, allocated load, available capacity, global utilization rate, overloaded resources count, overload days, unallocated demand days, under-served projects count, demand variation since last import, monthly mini-trends, priority alerts, action shortcuts.
2. **Capacity Command Center** — one row per resource, months as columns, net capacity/load/availability/utilization, heatmap, drill-down to allocations, grouping by resource type, filters/sort/search, quarter/semester/custom focus.
3. **Demand Coverage Board** — project × resource type, demand, allocated load, remaining demand, coverage rate, allocated resources, under-/over-service indicators, drag-and-drop, quick edit, monthly detail.
4. **Allocation Studio** — projects panel, resources panel, monthly timeline, available capacity, remaining demand, simulation before commit, single/multi-month allocation, month-to-month copy, bulk edit, undo/redo, save.
5. **Projects** — list/search/filter/create/edit/archive, detail (releases, demand, allocations, import history, variations).
6. **Releases** — list, calendar, go-live date, linked projects, create/edit/archive.
7. **Resources** — list, resource type, internal/external, company, activity dates, capacity, allocations, archive.
   - **Import resources** (`/resources/import`) — bulk-create Resources and Resource Types from a PSA "Availability list" export: preview of creates/updates/unchanged, `[Inactive Res.]` entries always skipped, new resource types shown before commit, atomic commit, downloadable Markdown report.
8. **Non-working Days** — annual grid (resources × months), fast entry, paste-from-Excel, totals, validation.
9. **Working Days** — working days per month/year, prefill, edit, validation, minimal history.
10. **Imports** — new import, import history, duplicates, errors, report, comparison, functional rollback.
11. **Demand Evolution** — comparison vs. previous import or any two selected imports; global/project/resource-type views; positive/negative/net delta.
12. **Companies** — CRUD, required for external resources.
13. **Settings** — resource types, companies, display preferences, theme, visual thresholds, display precision, backup import/export, data reset.

## Acceptance criteria (Given/When/Then, sample set — extend per lot)

### AC-1 — Overload is allowed and always visible

- **Given** a resource already at full net capacity for a month
- **When** the Domain Manager allocates additional days to that resource for that month
- **Then** the allocation is saved (never blocked), and the resource's row/cell shows an overload indicator with a label, icon, numeric value, and accessible tooltip.

### AC-2 — Partial allocation across multiple resources

- **Given** a project demands 3 days of a resource type in a month
- **When** the Domain Manager allocates 2 days to Resource A and 1 day to Resource B
- **Then** the project's remaining demand for that month/type is 0, and both allocations are persisted independently.

### AC-3 — Negative input rejected

- **Given** any day-amount input field
- **When** the Domain Manager types a negative number
- **Then** the field shows a validation error and the value is not saved.

### AC-4 — Import never silently drops a row

- **Given** an Excel import containing a row that cannot be confidently classified
- **When** the import wizard reaches the anomaly review step
- **Then** that row is listed explicitly for the Domain Manager to resolve (never silently ignored).

### AC-5 — Backup restore is atomic

- **Given** a backup file that fails schema validation partway through
- **When** the Domain Manager attempts to restore it
- **Then** no data in IndexedDB is modified (all-or-nothing), and a clear error is shown.

### AC-6 — Resource import unblocks the demand import

- **Given** a fresh app with no Resources or Resource Types
- **When** the Domain Manager imports the matching "Availability list" export via **Import resources**, then imports the demand workbook
- **Then** the demand import reaches "Atomic import" with zero blocking `unknown-resource`/`unknown-resource-type` anomalies, because the resource names line up exactly.

### AC-7 — Inactive resource entries are never imported

- **Given** an "Availability list" export containing a resource-type header prefixed `[Inactive Res.]`
- **When** the Domain Manager runs the resource import
- **Then** the person(s) listed immediately under that header are not created or updated, and the skipped count is shown in the preview — never silently merged into an active resource type.

## E2E scenarios (Playwright, `tests/e2e/`)

1. First launch. 2. Settings initialization. 3. Resource creation. 4. Project creation. 5. Release creation. 6. Import of the provided real Excel file. 7. Resolving an import anomaly. 8. Partial allocation of a resource. 9. Voluntary overload. 10. Editing an allocation. 11. Save. 12. Page reload + persistence check. 13. Second import. 14. Comparison with the previous import. 15. Backup export. 16. Controlled data wipe. 17. Backup restore. 18. Offline behavior. 19. Deployment under a GitHub Pages sub-path. 20. Keyboard navigation without drag-and-drop. 21. Bulk resource import from the "Availability list" export, followed by the demand import, with zero blocking anomalies (Lot 17).

Each scenario is added to `tests/e2e/` as its owning lot lands; see `traceability-matrix.md` for current status.
