---
title: Architecture
id: architecture
status: living
last_updated: 2026-09-08
---

# Architecture

## Context

```mermaid
graph TD
  User[Domain Manager] -->|browser| App[PWA: Resource Capacity & Project Demand Planner]
  App -->|reads| Excel[.xlsx export from PSA tool]
  App -->|reads/writes, via Worker| SQLite[(SQLite / OPFS)]
  App -->|export/import| Backup[Local JSON backup file]
  App -.->|no network calls| NoServer[No backend / No API]
```

No server, no authentication, no external API calls for business data. Local-only. Served as static files by Rebex Tiny Web Server (or any plain static host) — see `docs/pwa-and-hosting.md`.

## Components

```mermaid
graph LR
  UI[features/* pages] --> Domain[domain/* pure calculations & entities]
  UI --> Persistence[persistence/* SQLite repository]
  UI --> ImportPipeline[import/* Excel parsing + worker]
  Persistence --> SqliteWorker[workers/sqlite.worker.ts: OPFS connection]
  ImportPipeline --> Domain
  ImportPipeline --> Persistence
  Persistence --> Domain
```

## Stack

React 18 · TypeScript strict · Vite · Tailwind CSS v4 (`@tailwindcss/vite`) · React Router (`HashRouter`) · `@sqlite.org/sqlite-wasm` · `zod` · `react-hook-form` · `@tanstack/react-table` + `@tanstack/react-virtual` · `recharts` · `@dnd-kit` · `xlsx` · `lucide-react` · Vitest + React Testing Library · Playwright · ESLint + Prettier · GitHub Actions.

## Repository layout

```
public/assets/biomerieux-logo.jpeg
src/
  app/               # routing, app shell (AppShell, Sidebar, nav config)
  domain/
    entities/        # zod schemas + types
    calculations/     # capacity/workload/comparison formulas (framework-free)
    normalization/    # normalizeAmount and friends
  persistence/        # SQLite repository, migrations, backup
    sqlite/            # schema/DDL, engine (SQL <-> entity mapping), worker client,
                        # in-memory direct driver (tests), migrations runner
  import/             # Excel parsing, classification, worker
  features/            # one folder per page (dashboard, capacity, demand-coverage, ...)
  components/          # shared UI (KPI cards, status badges, filter bar, icons barrel)
    ui/                # base UI primitives (Button, Card, Tabs, Tooltip, IconButton, TableShell,
                        # IconChip, EmptyState, Skeleton)
  theme/               # theme resolution + persistence (applyTheme, useThemePreference,
                        # usePrefersReducedMotion)
  workers/             # Excel import parsing + sqlite.worker.ts (holds the OPFS connection)
  index.css            # branding, verbatim copy of data/index.css — never rewritten
  design-tokens.css    # companion token layer (elevation/shadow) — see docs/adr/0002
docs/
tests/{unit,component,e2e}/
AGENTS.md
.github/copilot-instructions.md
ai.memory
```

## Why HashRouter

The app is served as static files (Rebex Tiny Web Server, or any plain static host) with no confirmed server-side rewrite rule for SPA deep links. A `BrowserRouter` with `basename` would 404 on refresh/direct navigation to any route other than `/`. `HashRouter` sidesteps this entirely — all routing state lives after the `#`, so any URL always resolves to `index.html`. Revisit only if the hosting server is confirmed to support SPA fallback rewriting.

## Why SQLite (WebAssembly/OPFS) + JSON backup (not "a JSON file" as primary storage)

The original requirement text says "sauvegarder en local dans fichier JSON", which conflicts with performance/index requirements for thousands of allocations. Resolved (see `docs/adr/0001-indexeddb-as-source-of-truth.md`, superseded by `docs/adr/0005-sqlite-wasm-and-rebex-hosting.md`) as: SQLite compiled to WebAssembly, persisted via OPFS, is the source of truth (indexed, transactional, relational, quota-managed), JSON is the **export/backup/restore format**, satisfying both the performance need and the "critical, non-optional backup" requirement. SQLite superseded the original IndexedDB choice once GitHub Pages hosting (the original reason WASM was rejected) was removed.
