---
title: Functional Specification
id: functional-specification
status: living
last_updated: 2026-09-11
---

# Functional Specification

## Pages

1. **Dashboard** — net capacity, allocated load, available capacity, global utilization rate, overloaded resources count, overload days, unallocated demand days, under-served projects count, demand variation since last import, monthly mini-trends, priority alerts, action shortcuts. The Utilization trend chart has its own **resource type filter** (defaults to "All resource types") so the Domain Manager can slice the monthly trend by a single resource type without affecting the rest of the dashboard's totals/alerts. All day-amount values shown anywhere on the page (priority alerts, demand variation, KPI tiles) are rounded to one decimal place, never a raw unrounded float.
2. **Capacity Command Center** — one row per resource, months as columns, net capacity/load/availability/utilization, heatmap, drill-down to allocations, grouping by resource type, filters/sort/search, quarter/semester/custom focus. Every matching resource row is rendered (no inner-scroll clipping or virtualization) so the full team (~30 people) is visible for review at a glance; the table header stays sticky while the page scrolls. The per-resource/month drill-down drawer's allocations table shows each project's **code and name** (not code alone).
3. **Demand Coverage Board** — project × resource type, demand, allocated load, remaining demand, coverage rate, allocated resources, under-/over-service indicators, drag-and-drop, quick edit, monthly detail. Clicking a monthly tile (a project × resource-type × month cell) opens a detail drawer scoped to that exact cell: a Demand/Covered/Gap/Over-service summary, a Resource/Type/Days table of every resource assigned that month (with a total row), an explicit "No resources assigned yet." empty state, and a link to Allocation Studio. The tile is a real button (keyboard-activatable with Tab + Enter/Space, full `aria-label`), not a mouse-only affordance.
4. **Allocation Studio** — a Planisware-style assignment table: one demand line per (project, resource type) — Status, Resource type, Activity, Total supply, Total demand, plus a coverage-bar cell per month — followed by one assignment row per resource actually allocated to it, with a plain per-month day value. Only the **Project** column stays pinned while scrolling months horizontally (Activity/Resource type and the rest of the row scroll with the table). The **Resources bench** (the drag-and-drop source) stays pinned on-screen while the board scrolls vertically, so a resource card always stays reachable without scrolling back up; its list scrolls internally once it grows past the viewport. Each bench card's availability figure (net capacity, assigned load, utilization) is scoped to the currently selected Focus period (Year/S1/S2/Q1-Q4), not a single month, and the bench is sorted by that period-scoped available capacity. Dropping a resource card anywhere on a project's demand line (or arming a resource and activating a cell/row with the keyboard) proposes adding it across _every currently visible month_ at once, reviewed in a confirmation panel (per-month proposed days and before/after coverage) before anything joins the draft — committed as a single undo/redo step. An already-assigned resource's cell edits **inline**: click, Enter/Space, or typing a digit turns it into a number field (Enter/blur to commit, Escape to cancel, a negative value shown as an inline error rather than saved), `Delete`/`Backspace` clears a month directly, and a trash icon next to each assignment row's drag handle **unassigns** that resource from the project — removing its whole year of workload in one step, after a confirmation dialog stating the resource, project, and total days removed. Dragging an assignment row to move it to another project stays single-month, via the same quick-assign panel as before, which otherwise stays reserved for adding a _new_ resource to a project. Year/semester/quarter focus filtering (defaults to the full year); month-to-month copy; undo/redo (every change, including unassign, is a draft step); save; warns before closing the tab with unsaved changes.
5. **Projects** — list/search/filter/create/edit/archive, detail (releases, demand, allocations, import history, variations).
6. **Releases** — list, calendar, go-live date, linked projects, create/edit/archive.
7. **Resources** — list, resource type, internal/external, company, activity dates, capacity, allocations, archive.
   - **Import resources** (`/resources/import`) — bulk-create Resources and Resource Types from a PSA "Availability list" export: preview of creates/updates/unchanged, `[Inactive Res.]` entries always skipped, new resource types shown before commit, atomic commit, downloadable Markdown report.
8. **Non-working Days** — annual grid (resources × months), fast entry, paste-from-Excel, totals, validation.
9. **Working Days** — working days per month/year, prefill, edit, validation, minimal history.
10. **Imports** — new import, import history, duplicates, errors, report, comparison, functional rollback.
11. **Demand Evolution** — comparison vs. previous import or any two selected imports; global/project/resource-type views; positive/negative/net delta.
12. **Companies** — CRUD, required for external resources.
13. **Settings** — resource types, companies, display preferences, theme, visual thresholds, display precision, backup import/export, data reset. A one-click **database backup export** icon also sits in the app header, visible on every page, so exporting a backup never requires navigating to Settings first; it downloads the same validated JSON backup as the Settings export button and shows an inline confirmation.

## Navigation

The left sidebar (page navigation, including the app title) is pinned to the viewport on desktop (`position: sticky`) so it stays visible while the main content scrolls; on mobile it remains a full-height overlay opened via the header's menu button.

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
- **Then** no data in the local database is modified (all-or-nothing), and a clear error is shown.

### AC-6 — Resource import unblocks the demand import

- **Given** a fresh app with no Resources or Resource Types
- **When** the Domain Manager imports the matching "Availability list" export via **Import resources**, then imports the demand workbook
- **Then** the demand import reaches "Atomic import" with zero blocking `unknown-resource`/`unknown-resource-type` anomalies, because the resource names line up exactly.

### AC-7 — Inactive resource entries are never imported

- **Given** an "Availability list" export containing a resource-type header prefixed `[Inactive Res.]`
- **When** the Domain Manager runs the resource import
- **Then** the person(s) listed immediately under that header are not created or updated, and the skipped count is shown in the preview — never silently merged into an active resource type.

## E2E scenarios (Playwright, `tests/e2e/`)

1. First launch. 2. Settings initialization. 3. Resource creation. 4. Project creation. 5. Release creation. 6. Import of the provided real Excel file. 7. Resolving an import anomaly. 8. Partial allocation of a resource. 9. Voluntary overload. 10. Editing an allocation. 11. Save. 12. Page reload + persistence check. 13. Second import. 14. Comparison with the previous import. 15. Backup export. 16. Controlled data wipe. 17. Backup restore. 18. Offline behavior. 19. Deployment as static files under the root path (Rebex Tiny Web Server or an equivalent static host). 20. Keyboard navigation without drag-and-drop. 21. Bulk resource import from the "Availability list" export, followed by the demand import, with zero blocking anomalies (Lot 17). 22. Direct drag-and-drop of a resource card onto an Allocation Studio project row, reviewing and confirming a multi-month allocation across every visible month (Lot 22). 23. Arming a resource and using the row-level keyboard activator to add it across every visible month, with no drag-and-drop interaction (Lot 22). 24. Editing an Allocation Studio assignment cell inline and unassigning a resource from a project via the confirm dialog, both persisted through Save draft and surviving a page reload (Lot 23). 25. Filtering the Dashboard's Utilization trend chart by resource type and confirming the year totals/alerts elsewhere on the page are unaffected. 26. Clicking a Demand Coverage Board monthly tile (including via keyboard) and confirming the detail drawer shows the correct resources, totals, and empty state. 27. Exporting a database backup from the always-visible header icon from a non-Settings page.

Each scenario is added to `tests/e2e/` as its owning lot lands; see `traceability-matrix.md` for current status.
