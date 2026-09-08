---
title: Traceability Matrix
id: traceability-matrix
status: living
last_updated: 2026-09-08
---

# Traceability Matrix

Maps each major requirement to its implementing lot, key files, and validating tests. Updated at the end of every lot (see `AGENTS.md` §15, Definition of Done).

| Requirement                                                                     | Lot     | Key files                                                                                                             | Test(s)                                                                                      |
| ------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Project bootstrap, tooling, quality gate                                        | Lot 0   | `package.json`, `vite.config.ts`, `eslint.config.js`, `.github/workflows/ci.yml`                                      | `tests/unit/smoke.test.ts`, `tests/component/App.test.tsx`, `tests/e2e/first-launch.spec.ts` |
| Documentation & agent memory                                                    | Lot 1   | `AGENTS.md`, `.github/copilot-instructions.md`, `ai.memory`, `docs/*`                                                 | Manual review                                                                                |
| Domain entities & validation                                                    | Lot 2   | `src/domain/entities/*`                                                                                               | _(added by Lot 2)_                                                                           |
| IndexedDB persistence, migrations, backup                                       | Lot 2   | `src/persistence/*`                                                                                                   | _(added by Lot 2)_                                                                           |
| Numeric normalization                                                           | Lot 2/3 | `src/domain/normalization/normalizeAmount.ts`                                                                         | _(added by Lot 2)_                                                                           |
| Capacity/workload formulas                                                      | Lot 3   | `src/domain/calculations/*`                                                                                           | _(pending)_                                                                                  |
| Companies, resource types, working/non-working days                             | Lot 4   | `src/features/companies`, `src/features/resource-types`, `src/features/working-days`, `src/features/non-working-days` | _(pending)_                                                                                  |
| Projects & Releases                                                             | Lot 5   | `src/features/projects`, `src/features/releases`                                                                      | _(pending)_                                                                                  |
| Resources & Allocation rules                                                    | Lot 6   | `src/features/resources`, `src/domain/entities/allocation`                                                            | _(pending)_                                                                                  |
| Excel import pipeline                                                           | Lot 7   | `src/import/*`                                                                                                        | _(pending)_                                                                                  |
| Import history & comparison                                                     | Lot 8   | `src/features/imports`, `src/features/demand-evolution`                                                               | _(pending)_                                                                                  |
| Dashboard / Capacity Command Center / Demand Coverage Board / Allocation Studio | Lot 9   | `src/features/dashboard`, `src/features/capacity`, `src/features/demand-coverage`, `src/features/allocation-studio`   | _(pending)_                                                                                  |
| Filters & visual indicators                                                     | Lot 10  | `src/components` (filter bar, indicators)                                                                             | _(pending)_                                                                                  |
| PWA, backup UI, GitHub Pages deployment                                         | Lot 11  | `vite.config.ts`, `src/features/settings`, `.github/workflows/deploy.yml`                                             | _(pending)_                                                                                  |
| Accessibility & performance                                                     | Lot 12  | cross-cutting                                                                                                         | _(pending)_                                                                                  |
| Full test suite & quality gate                                                  | Lot 13  | `tests/*`                                                                                                             | _(pending)_                                                                                  |
| Deployment & final documentation                                                | Lot 14  | `docs/*`, live GitHub Pages URL                                                                                       | _(pending)_                                                                                  |

This table is updated as each lot completes; "pending" entries are filled in with concrete file/test references as work lands.
