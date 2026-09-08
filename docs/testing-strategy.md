---
title: Testing Strategy
id: testing-strategy
status: living
last_updated: 2026-09-08
---

# Testing Strategy

## Layers

- **Unit** (`tests/unit/`, Vitest): capacity/workload formulas, normalization, decimal parsing (French/English separators), Excel row classification, project/month parsing, import comparison logic, IndexedDB migrations, entity validation, backup serialization/restoration.
- **Component** (`tests/component/`, Vitest + React Testing Library): forms and their validation, non-working-days grid, allocation editing, filters, indicators, overload modal, import wizard, import comparison UI, unsaved-changes handling, critical responsive layouts, dialog focus handling, and axe-core accessibility smoke checks.
- **E2E** (`tests/e2e/`, Playwright): the 20 acceptance scenarios from `functional-specification.md` (first launch, settings init, resource/project/release creation, real-file import, anomaly resolution, partial allocation, voluntary overload, allocation edit, save, reload persistence, second import + comparison, backup export/restore, controlled wipe, offline behavior, GitHub Pages sub-path navigation, keyboard-only navigation without drag-and-drop).

## Fixtures

`data/export-philippe.perrin-151251-20260908-101608.xlsx` is the canonical real-world import fixture and must be used (copied under a test fixtures path if needed) by the import-pipeline tests — never a synthetic substitute alone.

## Quality gate (run before declaring any lot done)

```
npm install   # clean install when dependencies changed
npm run typecheck
npm run lint
npm run format:check
npm run test
npm run build
npm run test:e2e
```

No console errors, no new React warnings, no ignored failing test. Failures are fixed and the relevant command re-run until green, or documented as a known limitation in `ai.memory` with rationale.
