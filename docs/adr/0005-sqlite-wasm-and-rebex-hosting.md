---
title: 'ADR-0005: SQLite (WebAssembly/OPFS) as source of truth, Rebex Tiny Web Server hosting'
id: adr-0005
status: accepted
supersedes: adr-0001
date: 2026-09-09
---

# ADR-0005: SQLite (WebAssembly/OPFS) as source of truth, Rebex Tiny Web Server hosting

## Context

Two changes were requested together: improve the robustness of local data persistence, and stop hosting the app on GitHub Pages in favor of a local server (Rebex Tiny Web Server).

Rebex Tiny Web Server is confirmed to be a static-file-only HTTP server: no CGI, no server-side scripting, no ability to run backend code. Combined with the standing "no backend" hard rule (this app is single-user, single-machine, no auth), this means any new persistence engine must still run entirely in the browser — a real server-side SQLite process was never on the table.

ADR-0001 already anticipated this exact move and explicitly left it open: SQLite via WASM was "rejected for v1: adds a heavier dependency and a WASM asset pipeline for GitHub Pages, without a clear benefit... may be revisited if relational query complexity grows." With GitHub Pages being removed and durability of local persistence now an explicit goal, that rejection no longer holds.

## Decision

- **SQLite compiled to WebAssembly** (`@sqlite.org/sqlite-wasm`, the official SQLite-project-published package) is the source of truth, replacing IndexedDB (`idb`).
- Runs behind the **OPFS SyncAccessHandle Pool VFS** (`installOpfsSAHPoolVfs`), inside a **dedicated Worker** (`src/workers/sqlite.worker.ts`) — OPFS SyncAccessHandles are only obtainable in a Worker context. This VFS variant does **not** require COOP/COEP cross-origin-isolation headers (unlike the default OPFS VFS), which matters because Rebex Tiny Web Server's ability to set custom response headers is unconfirmed.
- The main thread talks to the Worker via a hand-rolled `{id, type, payload}` postMessage RPC (`src/persistence/sqlite/workerClient.ts`), matching the existing convention already used by `src/import/workerClient.ts` — no new RPC library was added.
- The generic per-store repository (`createRepository`) keeps its exact `{getAll, getById, getByIndex, put, delete, clear}` interface, so the ~60 existing call sites across `src/features/*` needed no changes. A new `runTransaction` primitive (`src/persistence/transaction.ts`), backed by real SQL `BEGIN`/`COMMIT`/`ROLLBACK`, replaces the raw multi-store IndexedDB transactions that used to live in `src/import/commit.ts`, `src/resourceImport/commit.ts`, `src/import/comparison.ts`, and `src/persistence/backup.ts`.
- Unit tests run the identical SQL/engine code against an in-memory (`:memory:`) SQLite instance on the main thread (`src/persistence/sqlite/directDriver.ts`) — no Worker, no OPFS — since jsdom cannot reliably host a real dedicated Worker with sync file-system handles.
- Hosting: `.github/workflows/deploy.yml` was removed. `vite.config.ts`'s `base` changed from `/explorResource/` to `/`. `HashRouter` was kept (Rebex's support for SPA-fallback rewrite rules is unconfirmed).
- `BACKUP_FORMAT_VERSION` was bumped from 1 to 2. The JSON envelope shape is unchanged, but a pre-migration (IndexedDB-era) backup and a post-migration (SQLite-era) backup would otherwise both claim `schemaVersion: 1` while meaning structurally different things.

## Consequences

- **New constraint vs. IndexedDB**: the OPFS SAH pool VFS holds an exclusive lock per database file — only one tab/window can have the app open at a time. `src/app/DatabaseLockGuard.tsx` detects a failed open and shows a clear "already open elsewhere" message with a reload button. No multi-tab sync was built; this app remains single-user, single-machine by design.
- **Foreign keys are defined but not enforced** (`PRAGMA foreign_keys` stays off in v1) — today's application logic already owns referential integrity (soft-delete/archive, hard-delete only at zero references), and turning on enforcement mid-migration would risk new write failures that don't exist today. Revisit as a separate, later ADR if warranted.
- **No automatic data migration** from the old IndexedDB store — a deliberate, confirmed decision. Existing users re-import via Excel or restore a JSON backup after updating.
- **e2e seeding changed**: Playwright's `page.evaluate` can no longer reach the database directly (it used to write straight into IndexedDB). A small window hook (`src/testHooks.ts`, `window.__plannerTestSeed`) is compiled in only when the build runs with `VITE_E2E_TEST_HOOKS=1` (`.env.e2e`, used exclusively by `playwright.config.ts`'s webServer) — never present in the real release build served by Rebex.
- **CI e2e still runs against `vite preview`**, not the real Rebex binary (a Windows executable, impractical to script on GitHub-hosted Ubuntu runners). Validating against real Rebex remains a manual smoke-test step before releases (`docs/deployment.md`).
- Node.js `>=22` is now required (declared in `package.json` `engines`, and CI's `setup-node` bumped from 20 to 22) — the `@sqlite.org/sqlite-wasm` package itself requires it.
- The service worker's precache list now includes `.wasm` — without it, opening the database (and therefore the whole app) fails after a page reload while offline, since the SQLite engine binary wouldn't be cached.

## Alternatives considered

- **`sql.js`**: pure in-memory WASM build, no native incremental disk persistence — every write would require re-exporting the entire database as a blob and writing it somewhere (which would just be IndexedDB again). Rejected as it doesn't actually improve on IndexedDB's persistence model for this app's write patterns.
- **`wa-sqlite`**: technically capable (it pioneered the OPFS SAH pool VFS), but a smaller community project with more manual VFS wiring than the SQLite-project-published package, which now ships the same VFS with a more polished worker-friendly API. Kept as a documented fallback if the official package's integration ever proves troublesome.
- **A real backend server + SQLite file on disk**: would require a server capable of executing code, which Rebex Tiny Web Server explicitly is not — ruled out unless the "single-user, single-machine" constraint changes.
