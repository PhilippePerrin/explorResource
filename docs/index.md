---
title: Documentation Index
id: docs-index
status: living
last_updated: 2026-09-09
---

# Documentation Index

This is the entry point to the functional and technical documentation of **Resource Capacity & Project Demand Planner**.

Convention: pragmatic Markdown with YAML frontmatter (stable `id`, `status`, `last_updated`), Mermaid diagrams where useful, ADRs for architecturally significant decisions, and Given/When/Then acceptance criteria. This is **not** a strict implementation of Google's "Open Knowledge Format" (OKF v0.2) — that format is real but targets AI-agent knowledge corpora, not project documentation; see `ai.memory` (2026-09-08) for the verification note.

## Map

| Document                                                     | Purpose                                                           |
| ------------------------------------------------------------ | ----------------------------------------------------------------- |
| [product-vision.md](./product-vision.md)                     | Why this app exists, who it's for, what "done" means              |
| [functional-specification.md](./functional-specification.md) | Pages, flows, acceptance criteria (Given/When/Then)               |
| [business-rules.md](./business-rules.md)                     | Capacity/workload formulas, invariants, edge cases                |
| [data-model.md](./data-model.md)                             | Entities, keys, indexes, relations, archiving/migration strategy  |
| [architecture.md](./architecture.md)                         | Tech stack, repository layout, diagrams                           |
| [import-format.md](./import-format.md)                       | Excel structure, classification strategy, cell-comment parsing    |
| [resource-import-format.md](./resource-import-format.md)     | Availability list Excel structure, classification, matching rules |
| [persistence-and-backup.md](./persistence-and-backup.md)     | SQLite (WebAssembly/OPFS), migrations, backup/restore             |
| [pwa-and-hosting.md](./pwa-and-hosting.md)                   | Manifest, service worker, base path, offline strategy, hosting    |
| [testing-strategy.md](./testing-strategy.md)                 | Unit/component/E2E coverage plan                                  |
| [accessibility.md](./accessibility.md)                       | WCAG 2.2 AA commitments                                           |
| [security-and-privacy.md](./security-and-privacy.md)         | Local-only data handling                                          |
| [deployment.md](./deployment.md)                             | Build & Rebex Tiny Web Server deployment steps                    |
| [troubleshooting.md](./troubleshooting.md)                   | Known issues and fixes                                            |
| [traceability-matrix.md](./traceability-matrix.md)           | Requirement → lot → files → test                                  |
| [adr/](./adr/)                                               | Architecture Decision Records                                     |

See also: [`AGENTS.md`](../AGENTS.md) (agent-facing spec), [`ai.memory`](../ai.memory) (living decision log), [`CHANGELOG.md`](../CHANGELOG.md).
