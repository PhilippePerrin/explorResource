# AGENTS.md

This file is the primary reference for any coding agent (GitHub Copilot, GitHub Copilot CLI, or any other AI agent) working on this repository. It must stay accurate and be updated whenever a decision, convention, or architectural choice changes.

## 1. Business objective

Build a Progressive Web Application — **Resource Capacity & Project Demand Planner** — for a **single user**, the **Domain Manager**, to:

- configure team resources, resource types, companies, projects, releases;
- manage working days per month and non-working days per resource/month;
- import project demand from Excel, keep import history, compare imports;
- allocate resources to projects (partial, split across resources, overload allowed);
- see capacity, overload, unassigned demand at project/resource/resource-type/department level;
- save changes locally and export/restore backups.

There is **no multi-user support, no authentication, no authorization, no approval workflow**. The Domain Manager can create, edit, and delete all data.

## 2. Business vocabulary (glossary)

| Term                                | Meaning                                                                                                                                 |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Domain Manager                      | The single end user of the application                                                                                                  |
| Project                             | Entity keyed by a functional `code` (regex `^[EPR]\d{4}$`)                                                                              |
| Group                               | A non-conforming code found in real imports (e.g. `GIS0006`, `RUN0001`) — a portfolio/grouping row, **read-only**, never a real Project |
| Release                             | A deliverable with one go-live date; a Project may have 0..N releases                                                                   |
| ResourceType                        | A skill/role category (e.g. "Commerce - SFDC Developer - EUR")                                                                          |
| Resource                            | A person, internal or external, of one ResourceType                                                                                     |
| DemandSnapshot                      | Monthly demand (in days) for a project × resource type, tied to an import version                                                       |
| Allocation                          | Monthly assignment (in days) of a Resource to a Project × ResourceType                                                                  |
| ImportBatch                         | An immutable, versioned Excel import                                                                                                    |
| Capacité brute / nette / disponible | Gross / net / available capacity — see business rules below                                                                             |
| Gap (Excel source)                  | The numeric value stored in demand-row monthly cells in the source PSA export is `demand − supply`, **not** raw demand                  |

## 3. Invariant rules (never violate without an explicit, dated decision in `ai.memory`)

- January → December only; the annual view always has 12 months. No other fiscal year start.
- All workload/capacity/demand/allocation values are **days**, decimal allowed, stored as unrounded `number`.
- Negative values entered by the user are rejected. Tiny floating-point noise (e.g. `4.4408920985006262e-16`) is normalized to `0` via a single centralized function (`src/domain/normalization/normalizeAmount.ts`), tolerance `1e-6` day (configurable in `AppSettings`, never hardcoded twice).
- Overload is **always allowed**, **never blocks saving**, and **must always be visually flagged** (label + icon + numeric value + accessible tooltip — never color alone).
- Project functional key = `code` only. **Never merge projects by name.**
- A resource can only be allocated against a demand of a **compatible ResourceType**.
- Deletion is **soft (archive) by default**. Hard delete is only allowed when an entity has zero references.
- Every import creates an **immutable version**. Comparison is always by `projectCode + resourceType + year + month` against the previous validated import by default (or any two user-selected imports).
- No backend, no authentication, no login, no server API, no telemetry, no secrets in the repo, no unnecessary cookies. **100% client-side, SQLite (WebAssembly, OPFS) + local file backup.**
- Static-hosting compatibility (`base: '/'` in Vite, `HashRouter`, served by Rebex Tiny Web Server locally) must never be broken.
- The database lives behind one Worker-held OPFS connection (`src/workers/sqlite.worker.ts`) — only one tab/window can hold it at a time. This app is single-user, single-machine by design; don't build multi-tab sync as a workaround.
- The bioMérieux branding (`src/index.css`, copied verbatim from `data/index.css`) must never be rewritten/redesigned — only consumed via existing CSS variables/Tailwind theme tokens. Non-brand design tokens (elevation/shadow, etc.) live in the companion file `src/design-tokens.css` instead — see `docs/adr/0002-design-token-layering.md`.
- The logo (`public/assets/biomerieux-logo.jpeg`) is never redrawn in CSS.
- Shared UI primitives (Button, Card, Tabs, Tooltip, IconButton, TableShell, IconChip, EmptyState, Skeleton) live in `src/components/ui/`; icons go through the `src/components/icons.ts` barrel (`lucide-react`) and are always decorative (`aria-hidden`) — see `docs/adr/0003-icon-library.md`.
- Status/severity colors (success/caution/attention/critical/info) and the non-brand data-viz accent live as tokens in `src/design-tokens.css` (never `src/index.css`) — see `docs/adr/0004-2026-visual-pass-accent-and-status-tokens.md`. Never hardcode a raw Tailwind status color; consume these tokens so both themes stay correct.

## 4. Confirmed decisions from planning (Phase 1 clarifications)

Dated: 2026-09-08.

| Topic                                                          | Decision                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Codes not matching `^[EPR]\d{4}$` (e.g. `GIS####`, `RUN####`)  | Imported as read-only `Group` entities. Projects nested under them are still imported normally.                                                                                                                                                           |
| "Supply" rows (real resource name under a demand row)          | Seed/initialize `Allocation` records at import time (`origin: 'import'`).                                                                                                                                                                                 |
| Real monthly demand/supply                                     | Extracted from Excel **cell comments** (`Demand : X (Day) ... Supply : Y (Day)`), with automatic fallback to gap-based derivation (`demand = supply + cellValue`) if the comment is missing/unparsable — flagged as a derived-value anomaly in that case. |
| Manual adjustments vs re-import                                | Row-by-row review proposed at every new import; the Domain Manager chooses keep vs overwrite per project/month.                                                                                                                                           |
| Project missing from a new import                              | Kept, flagged "absent from latest import", never auto-deleted.                                                                                                                                                                                            |
| Unknown resource/resource-type in Excel                        | Always flagged as a blocking anomaly in the import wizard; user creates/maps/excludes manually. Never auto-created silently.                                                                                                                              |
| Numeric normalization tolerance                                | `1e-6` day.                                                                                                                                                                                                                                               |
| Deletion vs archive                                            | Soft-delete (archive) everywhere by default; hard delete only if zero references.                                                                                                                                                                         |
| Documentation format                                           | Pragmatic Markdown + YAML frontmatter + Mermaid + ADRs + traceability matrix. **Not** strict OKF v0.2 (a real but unrelated Google format for agent knowledge corpora — verified to exist, but out of scope for this project's docs).                     |
| UI language                                                    | English.                                                                                                                                                                                                                                                  |
| GitHub Pages repo/base path (superseded 2026-09-09, see below) | `explorResource` → `/explorResource/`.                                                                                                                                                                                                                    |

### 4.1 Persistence & hosting migration (dated 2026-09-09)

Superseded the decisions above. See `docs/adr/0005-sqlite-wasm-and-rebex-hosting.md` for the full rationale.

| Topic                   | Decision                                                                                                                                                                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Persistence engine      | SQLite compiled to WebAssembly (`@sqlite.org/sqlite-wasm`), OPFS SyncAccessHandle Pool VFS, running in a dedicated Worker. Replaces IndexedDB (`idb`) as the source of truth. Still no backend — the database is entirely client-side. |
| Hosting                 | GitHub Pages removed entirely (`.github/workflows/deploy.yml` deleted). The app is built as static files (`base: '/'`) and served locally via Rebex Tiny Web Server (a static-file-only server — confirmed no server-side scripting).  |
| Users                   | Stays single-user, single-machine — no multi-tab/multi-user sync was added.                                                                                                                                                            |
| Existing IndexedDB data | No automatic migration. Users re-import via Excel or restore an existing JSON backup after updating.                                                                                                                                   |
| Backup format           | `BACKUP_FORMAT_VERSION` bumped 1 → 2 (JSON envelope shape unchanged) so pre-migration and post-migration backups are never ambiguously treated as the same schema generation.                                                          |

## 5. Architecture & tech stack

- React 18 + TypeScript strict + Vite. PWA via `vite-plugin-pwa` (Workbox, app-shell caching only — **never cache business data**; the SQLite `.wasm` binary is precached too, since without it the app can't open its database offline).
- Tailwind CSS v4 (`@tailwindcss/vite`) consuming `src/index.css` (verbatim copy of the provided branding tokens).
- Routing: `react-router-dom` `HashRouter` (avoids 404s on deep-link refresh under a static host — Rebex Tiny Web Server — with no server-side rewrite).
- State: React Context + hooks + `useReducer` per domain. No Redux.
- Persistence: `@sqlite.org/sqlite-wasm` (SQLite compiled to WebAssembly, OPFS SyncAccessHandle Pool VFS) as the source of truth, behind a dedicated Worker (`src/workers/sqlite.worker.ts`); JSON export/import for backup (not the primary store).
- Excel import: `xlsx` (SheetJS) run in a Web Worker; cell-comment extraction required (see §4).
- Validation: `zod`. Forms: `react-hook-form` + zod resolver.
- Large tables: `@tanstack/react-table` + `@tanstack/react-virtual`.
- Charts: `recharts`. Drag-and-drop: `@dnd-kit/*` with a full keyboard/form alternative (never mandatory).
- Quality: ESLint flat config + Prettier, Vitest + React Testing Library, Playwright, GitHub Actions (`ci.yml` for PR/push checks — no deployment workflow; deployment is a manual copy to the Rebex-served folder, see `docs/deployment.md`).

## 6. Repository layout

See `docs/architecture.md` for the authoritative, up-to-date tree. Summary: `src/domain` (entities, calculations, normalization — framework-free, unit-tested), `src/persistence` (SQLite repository, migrations, backup — `src/persistence/sqlite/` holds the engine/schema/driver internals), `src/import` (Excel parsing pipeline, classification, worker), `src/features/*` (one folder per page), `src/components` (shared UI), `src/workers` (Excel import parsing + `sqlite.worker.ts`, the only context allowed to hold the OPFS connection), `tests/{unit,component,e2e}`, `docs/*`, `AGENTS.md`, `ai.memory`, `.github/copilot-instructions.md`.

## 7. Commands

```
npm install
npm run dev
npm run typecheck
npm run lint
npm run format        # write
npm run format:check  # CI
npm run test          # vitest run (unit + component)
npm run test:watch
npm run test:e2e      # playwright
npm run build          # tsc -b && vite build
npm run preview
```

## 8. TypeScript & component conventions

- `strict: true`, `noUncheckedIndexedAccess: true` — never silence with `!` unless justified in a comment.
- One zod schema + inferred TS type per entity in `src/domain/entities/`, exported from a barrel `index.ts`.
- Pure calculation functions (capacity, workload, deltas, normalization) live in `src/domain/**` and must be usable/testable without React or IndexedDB.
- Path alias `@/*` → `src/*`.
- No default exports except page/root components where React conventions expect them; prefer named exports otherwise.
- Every page must have a keyboard-only path for every action that also has a mouse/drag-and-drop path.

## 9. Calculation rules (see `docs/business-rules.md` for full detail)

```
capacitéBrute = joursTravaillésDuMois
capacitéNette = max(0, capacitéBrute − joursNonTravaillés)
chargeAffectée = somme des affectations de la ressource, tous projets, ce mois
capacitéDisponible = capacitéNette − chargeAffectée
chargeNonAffectéeProjet = max(0, demandeProjet − sommeDesAffectationsProjet)
tauxUtilisation = chargeAffectée / capacitéNette * 100  (0 if capacitéNette = 0 and chargeAffectée = 0; "surcharge critique" if capacitéNette = 0 and chargeAffectée > 0)
```

## 10. Import rules

- Classification uses **combined criteria**: project-code regex, known resource-type label, known resource name, `Total supply`/`Total demand` columns, hierarchical position, Excel style as a **secondary** signal only, and `Status`/`Resource`/`Activity` column content. Never classify by style alone.
- Any ambiguous row is presented to the user — **never silently dropped**.
- SHA-256 of the source file is computed to detect duplicate imports.
- Import is transactional: cancel leaves data untouched; validation writes atomically.

## 11. Persistence rules

- SQLite (WebAssembly, OPFS) is the source of truth; every write is validated through the entity's zod schema before being persisted (`src/persistence/schemaRegistry.ts`).
- Migrations are versioned and additive — see `src/persistence/sqlite/migrations.ts` header comment for the exact pattern before adding a new one.
- Backup export/import is the **critical, non-optional** feature (local-only app). Round-trip must be lossless and schema-validated. Restore is atomic (`src/persistence/transaction.ts`'s `runTransaction`) and never partially applies a corrupt backup.
- The generic repository (`createRepository`) doesn't support cross-store atomic writes; multi-table commits (import commit, resource-import commit, demand rollback, backup restore) go through `runTransaction` instead — never hand-roll a second ad hoc transaction mechanism.

## 12. Testing strategy

See `docs/testing-strategy.md`. Minimum: unit tests for every calculation/normalization/classification/comparison rule, component tests for every form/table/wizard/filter/indicator, the 20 E2E scenarios listed in the original functional spec and `docs/functional-specification.md`.

## 13. Accessibility

WCAG 2.2 AA target. Keyboard navigation, visible focus, ARIA labels, no color-only signal, `prefers-reduced-motion` respected, full drag-and-drop keyboard/form alternative.

## 14. Hosting requirements

`vite.config.ts` `base: '/'`, `HashRouter`, PWA manifest/service worker scoped to that base path. No deployment workflow — see `docs/deployment.md` for the manual Rebex Tiny Web Server steps. `.env.e2e` + `playwright.config.ts`'s `--mode e2e` build exist only to expose a test-seeding hook (`src/testHooks.ts`) for Playwright, since the database now lives behind a Worker that `page.evaluate` can't reach directly; never let that hook ship in the real release build.

## 15. Definition of Done (per lot)

A lot is **not** done until: its own unit/component/E2E tests pass, `npm run typecheck && npm run lint && npm run format:check && npm run test && npm run build` all pass with zero errors and no new warnings, its slice of `docs/*` is updated, `ai.memory` is updated (status, decisions, open questions), and a factual commit is made. **Never declare a lot done if its required tests fail.**

## 16. Files never to modify without explicit justification recorded in `ai.memory`

- `src/index.css` (bioMérieux branding, copied verbatim from `data/index.css`)
- `public/assets/biomerieux-logo.jpeg`
- `data/*` (original input files — reference fixtures, read-only)

## 17. Documentation update procedure

Whenever a business rule, entity, or architectural decision changes: update `AGENTS.md` (this file), the relevant `docs/*.md`, `.github/copilot-instructions.md` if the summary is affected, and append a dated entry to `ai.memory`. Add an ADR under `docs/adr/` for any architecturally significant decision (new dependency, storage strategy change, routing strategy change, etc.).

## 18. Hard prohibitions

No backend. No authentication/login of any kind. No secrets committed. Never break static-hosting compatibility (`base: '/'`, `HashRouter`, no server-side rewrite assumed). Never silently ignore an Excel row. Never delete data without confirmation. Never claim tests passed without running them. Never claim a file was created without actually creating it.
