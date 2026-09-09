# Changelog

All notable changes to this project are documented in this file. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added — Lot 0 (bootstrap)

- Vite + React 18 + TypeScript strict project scaffold.
- Tailwind CSS v4 wired to the existing bioMérieux branding tokens (`src/index.css`).
- ESLint (flat config) + Prettier, Vitest + React Testing Library, Playwright.
- `vite-plugin-pwa` manifest + service worker (app-shell caching only).
- GitHub Actions CI (`ci.yml`) and GitHub Pages deploy workflow (`deploy.yml`).
- Base path `/explorResource/` and `HashRouter` for GitHub Pages compatibility.
- Full feature-folder skeleton for upcoming lots.

### Added — Lot 1 (documentation & memory)

- `AGENTS.md`, `.github/copilot-instructions.md`, `ai.memory`.
- `README.md`, this `CHANGELOG.md`, and the `docs/` skeleton (see `docs/index.md`).

### Added — Lot 2 (domain & persistence)

- Zod schemas for all domain entities (`base`, `appSettings`, `masterData`, `imports`, `planning`, `audit`).
- Generic IndexedDB repository (`idb`) with versioned migrations.
- Backup service: full JSON export/import in a single atomic transaction, validated by schema on restore.

### Added — Lot 3 (calculation engine)

- Pure calculation module `src/domain/calculations/`: gross/net/available capacity, assigned/unassigned load, configurable utilization classification, and `tauxUtilisation` with an explicit `capacity = 0` edge case (`ratePercent: null` + `isCriticalOverload`).
- Centralized floating-point normalization (`normalizeAmount`, `epsilon = 1e-6`), unit-tested against the real file's `-4.44e-16` noise value.

### Added — Lot 4 (referentials)

- `CompaniesPage`, `ResourceTypesPage`, `WorkingDaysPage`, `NonWorkingDaysPage`.
- Archive-first deletion policy; hard delete only when zero references remain.
- Annual non-working-days grid with Excel-style paste, year duplication, and row/column totals.

### Added — Lot 5 (projects & releases)

- `ProjectsPage`, `GroupsPage` (read-only GIS/RUN groups), `ReleasesPage`.
- N-N `ProjectRelease` linking, go-live timeline, archive-before-delete for referenced records.

### Added — Lot 6 (resources & allocations)

- `ResourcesPage` with CRUD and an embedded Allocation panel (company required for external collaborators).
- Over-service detection against current demand.

### Added — Lot 7 (Excel import pipeline)

- Real-file-driven import pipeline (`src/import/*`, `src/workers/import.worker.ts`): row classification (regex + `NO_IMPORT*` defined names + cell style), demand/supply extraction from cell comments with gap-based fallback, SHA-256 duplicate detection, a native Web Worker off the UI thread, and a downloadable Markdown import report.
- Confirmed experimentally that `xlsx@0.18.5` exposes cell comments directly (`worksheet[cellRef].c`); no manual ZIP/XML parsing was needed.

### Added — Lot 8 (import history & comparison)

- Immutable `ImportBatch` history, diff engine by logical key (`projectCode + resourceTypeId + year + month`), comparison views, and functional rollback (writes new `manual-adjustment` snapshots — never deletes history).

### Added — Lot 9 (pilot views)

- `DashboardPage`, `CapacityCommandCenterPage` (virtualized heatmap), `DemandCoverageBoardPage`, `AllocationStudioPage` (drag-and-drop + full keyboard/form alternative, simulation before commit, undo/redo, local draft with explicit Save).
- Shared pure aggregations in `src/domain/calculations/planningAggregations.ts`.

### Added — Lot 10 (filters, search, visual indicators)

- Persistent, per-page filter bar with saved favorites.
- Configurable utilization thresholds surfaced everywhere as label + icon + value + tooltip (never color alone).

### Added — Lot 11 (PWA, backup UI, GitHub Pages)

- `vite-plugin-pwa` manifest + Workbox service worker (app-shell caching only, no business data cached).
- Update-available banner, backup export/import/reset screens, `deploy.yml` GitHub Pages workflow.

### Added — Lot 12 (accessibility & performance)

- All 13 routes converted to `React.lazy` + `Suspense`; main entry bundle reduced from ~1032 KB to 174 KB (gzip).
- ARIA/landmark/focus-trap fixes, `prefers-reduced-motion` guards, memoized hot-path components, axe-core smoke tests, keyboard-navigation E2E coverage.

### Added — Lot 13 (complete test suite & quality gate)

- Full Playwright E2E suite (`tests/e2e/{first-launch,backup-and-reset,import-flow,master-data-and-allocation}.spec.ts`) mapping all 20 numbered acceptance scenarios from the functional specification.
- 40 test files / 103 unit + component tests, all green; clean-install quality gate (typecheck, lint, format, test, build) verified stable across repeated runs.

### Added — Lot 14 (deployment & final documentation)

- Deployed to GitHub Pages: **https://philippeperrin.github.io/explorResource/** via `actions/deploy-pages`, base path `/explorResource/` confirmed live.
- Fixed two CI-only (Ubuntu runner) test issues not reproducible after only a few local Windows runs:
  - jsdom reports `offsetHeight`/`offsetWidth` as `0` (no real layout engine), which made `@tanstack/react-virtual` fall back to rendering every row unvirtualized; a 200-resource synthetic dataset test then rendered thousands of real DOM nodes and timed out under CI's slower CPU allocation. Fixed by stubbing a realistic fixed viewport size in `tests/unit/setup.ts`, so the virtualizer behaves deterministically in tests the same way it does in real browsers (test now runs in ~1.3s, down from 6-9s).
  - A resource `<select>` in `AllocationStudioPage`/`ResourcesPage` tests was interacted with immediately after render, before the async-loaded option list had populated — occasionally too slow under CI contention. Fixed by waiting for a known async-loaded value before interacting with the select.
- Finalized `docs/traceability-matrix.md` (all lots mapped to concrete files/tests, no remaining placeholders) and this changelog.
- Verified GitHub Actions `CI` and `Deploy to GitHub Pages` workflows both green on the final commit.

### Added — Lot 15 (2026 visual foundation)

- New design-token companion file `src/design-tokens.css` (imported after the protected `src/index.css`) adding an elevation/shadow scale (`--shadow-xs/sm/md/lg`, light/dark aware) without touching the bioMérieux branding file. See `docs/adr/0002-design-token-layering.md`.
- Adopted `lucide-react` as the icon library (`src/components/icons.ts` barrel); replaced Unicode pseudo-icons in `UtilizationBadge`, `DemandCoverageBadge`, and `SettingsPage` threshold hints with real icons, kept strictly decorative (`aria-hidden`) — every status indicator still conveys label + icon + value + tooltip. See `docs/adr/0003-icon-library.md`.
- New shared UI primitives in `src/components/ui/`: `Button`, `Card`, `Tabs` (roving-tabindex, arrow-key/Home/End navigation), `Tooltip`, `IconButton`, `TableShell`.
- Replaced the flat 14-item top nav with a collapsible, grouped sidebar app shell (`src/app/AppShell.tsx`, `Sidebar.tsx`, `nav.ts`): Overview / Planning / Master Data / Calendars / Imports / Settings groups, off-canvas drawer on narrow viewports, collapse state persisted in `localStorage`. All existing routes, the skip link, the app title text, and the single `<main id="main-content">` landmark preserved unchanged.
- Wired the previously dormant `ThemePreference` (light/dark/system) into an actual Settings control (`src/theme/applyTheme.ts`, `useThemePreference.ts`): resolves `system` via `prefers-color-scheme`, reacts live to OS theme changes, caches the preference in `localStorage` to avoid a flash of the wrong theme on load, IndexedDB `appSettings` stays source of truth.
- New tests: `src/components/ui/*` primitives, `applyTheme`, theme-persistence in `SettingsPage`, grouped-nav coverage in `App.test.tsx`. Updated existing badge-glyph assertions across Capacity/Allocation Studio/Demand Coverage/Resources tests to check the badge's accessible name instead of the (now icon-based) Unicode glyph.

### Added — Lot 16 (Planning pages reskin)

- `DashboardPage`: adopted `ui/Card` for section chrome, recharts styling extracted into `src/features/dashboard/chartTheme.ts` (brand-blue/gold/red line colors, theme-aware grid/axis/tooltip/legend), chart line animation gated behind a new `usePrefersReducedMotion` hook, alert icons switched from a raw Unicode field on `DashboardAlert` to a `tone`-keyed lucide icon map in the page.
- `CapacityCommandCenterPage`: adopted `ui/Card` for section chrome and `ui/TableShell` for the non-virtualized drill-down allocations table. The virtualized heatmap table intentionally keeps its split header/body `<table>` architecture (not wrapped in `TableShell`) to avoid disturbing `@tanstack/react-virtual`'s measurement of the scrolling container; zebra striping there is applied per-row keyed off the absolute row index instead of `nth-child`, since virtualization only renders a sliding window and `nth-child` would shift during scroll.
- `DemandCoverageBoardPage`: adopted `ui/Card` and `ui/TableShell` (with zebra striping) for the coverage matrix.
- `AllocationStudioPage`: adopted `ui/Card` for all six panel sections and `ui/Button` for the plain action buttons (Undo, Redo, Save draft, Simulate change, Queue change, Copy month into draft) and `ui/TableShell` for the allocation board table. The dnd-kit-driven `DraggableToken`/`DroppableProjectCell` components and the keyboard-operable drop-target buttons were left untouched — verified via the existing axe keyboard-path test and the Playwright keyboard-only Allocation Studio e2e scenario, both still green.
- Fixed two small pre-existing mojibake characters (`�`) in `CapacityCommandCenterPage` and `DemandCoverageBoardPage` copy, found while touching those files.
- Verified GitHub Actions `CI` workflow gate locally: `typecheck`, `lint`, `format:check`, `test -- --coverage` (3 consecutive clean runs, 47 files / 128 tests), `build`, `test:e2e` (11/11) all green; manual browser verification via a Playwright driver script confirmed zero console errors across Dashboard, Capacity, Demand Coverage, and Allocation Studio.

### Added — Lot 17 (bulk Resource import)

- Diagnosed "the import doesn't work" by running the real demand-import parser (`analyzeImportWorkbook`) against the real fixture with an empty `Resource`/`ResourceType` set: 132 blocking anomalies (every demand/supply row), vs. 0 once the matching resources exist. The demand-import parser itself needed no fix — a fresh install simply had no way to bulk-create the ~23 resources it depends on.
- New parallel importer for PSA "Availability list" exports (`src/resourceImport/*`, `src/workers/resourceImport.worker.ts`, `src/features/resource-import/ResourceImportPage.tsx`, new route `/resources/import`): parses the flattened company/division/resource-type/person/detail-row tree, matches existing resources by exact "Firstname LASTNAME" (same convention as the demand importer), stages new/changed resources and resource types for review, and commits them in one IndexedDB transaction (`resourceTypes` + `resources` + `importBatches`).
- Any resource-type header prefixed `[Inactive Res.]` is always skipped — confirmed on the real fixture that this prefix marks exactly the one person-block immediately following it as a historical/ended assignment (e.g. "Hassan ALAMI" reappears once under an inactive marker), never a persistent mode; the parser reverts to the previously active resource type for anything listed after it.
- An existing resource whose type differs from the file is auto-updated only when it has no allocations yet (the existing `resourceUtils.ts` rule already forbids an in-place type change once allocations exist); otherwise the change is skipped and reported (`skippedTypeChanges`), never silently dropped or forced.
- Added `ImportBatch.kind` (`'demand' | 'resource'`, defaulting to `'demand'` for every pre-existing batch) so the two importers' history/comparison views never mix; `ImportsPage`'s anomaly-review step now links to `Import resources` whenever `unknown-resource`/`unknown-resource-type` anomalies (or an empty resource list) are detected.
- New tests: `tests/unit/resourceImport/{parse,commit,wizardMachine}.test.ts` (including synthetic-workbook coverage for the `[Inactive Res.]` one-shot reversion, orphan rows, and conflicting-type detection), `tests/component/features/resource-import/ResourceImportPage.test.tsx`, and `tests/unit/import/resourceThenDemandImport.test.ts` — a formal regression proving the resource-import output lets the real demand fixture commit with zero blocking anomalies.

### Added — Lot 18 (2026 visual pass: Master Data pages reskin)

- `ProjectsPage`, `GroupsPage`, `ReleasesPage`, `ResourcesPage`, `ResourceImportPage`, `CompaniesPage`, `ResourceTypesPage` adopted `ui/Card`, `ui/TableShell` (zebra), and `ui/Button` for section chrome, tables, and actions, matching the Lot 16 pattern.
- Status pills (active/archived, etc.) switched from hardcoded dark-only Tailwind colors to the new theme-aware status tokens (see Lot 20).
- All accessible loading/empty-state text preserved byte-for-byte; a recurring pitfall was caught and fixed on several pages: `Card` renders a `<div>`, not a `<section>`, so component/E2E tests that scope queries via `heading.closest('section')` or `locator('section').filter({ has: heading })` silently widen their match if a `<section>` is swapped for a bare `Card`. Fixed by keeping `<section>` (carrying `Card`'s class string) wherever a test depends on that landmark.

### Added — Lot 19 (2026 visual pass: Calendars, Imports, Settings)

- `WorkingDaysPage`, `NonWorkingDaysPage`, `ImportsPage`, `SettingsPage` (full reskin, beyond the partial icon/theme-switcher treatment from Lot 15) adopted the same `Card`/`TableShell`/`Button` pattern.
- `NonWorkingDaysPage`'s annual absence grid (sticky first column, cell-level Excel/TSV paste) intentionally left unwrapped by `TableShell` — the risk to its paste/sticky-column behavior outweighed the visual gain; only its empty state was reskinned.
- Fixed the same `Card`-is-a-`div` pitfall as Lot 18 in `ImportsPage`/`ResourceImportPage`'s history sections, caught by the full E2E suite (`import-flow.spec.ts`, `resource-import-flow.spec.ts`) after passing at the component-test level, since those two specific locators only exist in Playwright specs, not component tests.

### Added — Lot 20 (2026 visual pass: "wahou" polish — accent color, duotone icon chips, Dashboard hero)

- New non-brand tokens in `src/design-tokens.css` (never `src/index.css`, which stays byte-identical to the bioMérieux brand drop despite explicit authorization to change it — unnecessary once `design-tokens.css` covered every need): a centralized status-color scale (`--status-{success,caution,attention,critical,info}-{bg,text,border}`, dark + light) replacing hardcoded Tailwind colors in `UtilizationBadge`/`DemandCoverageBadge` that only rendered correctly in dark mode; a data-viz-only accent (`--accent-viz-*`, soft violet) never used for brand chrome; halo tokens (`--glow-*`) and an `--ease-out-expo` easing token. See `docs/adr/0004-2026-visual-pass-accent-and-status-tokens.md`.
- New shared components `src/components/ui/{IconChip,EmptyState,Skeleton}`, exported from the `ui/` barrel — a tinted, bordered icon badge (duotone effect without a second icon library), a consistent empty-list treatment, and a loading-state treatment using the existing `.skeleton-pulse` keyframe from `index.css`.
- `src/components/icons.ts` extended from 14 to ~40 `lucide-react` re-exports covering every remaining page's domain, still funneled through the single audited barrel (ADR-0003).
- Dashboard gets one orchestrated entrance moment on mount (staggered `hero-rise` fade/rise across the KPI row then the chart/alerts cards, plus a small decorative gradient glow behind the header icon) — not a per-card hover effect repeated elsewhere. Gated behind `prefers-reduced-motion: no-preference`, same pattern as every other animation already in the codebase.
- Fixed shared-component inconsistencies found during the pass: `ConfirmDialog`, `FilterBar`, and `UpdateBanner` now reuse `ui/Button` instead of duplicating its styling by hand; raw Tailwind `shadow-2xl`/`shadow-sm` replaced by the theme-aware `ui-shadow-lg`/`ui-shadow-sm` tokens in `ConfirmDialog`, `UpdateBanner`, and `MetricCard`.
- Full quality gate green after merging all Lot 18-20 work: `typecheck`, `lint`, `format:check`, `test` (52 files / 148 tests), `build` (largest chunk 395 kB, no Rollup size warning), `test:e2e` (12/12). Manual verification via an ad hoc Playwright script against `vite dev`: screenshots of Dashboard/Projects/Working Days/Non-working Days/Settings in both light and dark theme (dark forced via `colorScheme: 'dark'`, since headless Chromium's default "system" preference resolves to light), zero console errors.
