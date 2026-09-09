---
title: Security & Privacy
id: security-and-privacy
status: living
last_updated: 2026-09-08
---

# Security & Privacy

## Data locality

All business data (projects, resources, allocations, imports, etc.) is stored **exclusively in a local SQLite database (WebAssembly, persisted via OPFS — the browser's Origin Private File System)**. No business data is ever transmitted to a server — there is no backend and no external API call for business data.

## Authentication

None. Single-user, local application by design (see `AGENTS.md` §1). No login, no roles, no session tokens.

## Secrets

No secrets are used or stored by this application, and none may ever be committed to this repository.

## File import

Excel import is processed **entirely client-side** (in-browser, optionally in a Web Worker for performance) — the file never leaves the browser.

## Backup files

Backup JSON files are plain, unencrypted files saved/opened by the user through the browser's file picker. They may contain business data (project names, resource names) — the Domain Manager is responsible for storing them appropriately; the app does not transmit them anywhere.

## Third-party dependencies

Only well-known, actively maintained open-source libraries are used (see `architecture.md`). No analytics/telemetry SDKs are included.
