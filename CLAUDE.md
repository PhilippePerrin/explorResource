# GitHub Copilot instructions

This repository implements **Resource Capacity & Project Demand Planner**, a local-first, single-user Progressive Web App (no backend, no auth). Full detail lives in `AGENTS.md` and `docs/`; this file is a condensed summary for Copilot.

## Domain

- Single user: the Domain Manager. No roles, no login, no approval workflow.
- Core entities: Company, ResourceType, Resource, Release, Project (functional key = `code`, regex `^[EPR]\d{4}$`), Group (non-conforming codes like `GIS####`/`RUN####`, read-only), ProjectRelease, WorkingDaysCalendar, ResourceNonWorkingDays, ImportBatch, ImportRawRow, DemandSnapshot, Allocation, ChangeSet, AuditEntry.
- Year is always January–December. Time views: year, S1, S2, Q1–Q4, custom range within one year.
- All workload values are in days, decimals allowed, unrounded `number` storage. Negative user input rejected. Tiny float noise normalized to `0` below `1e-6` via `src/domain/normalization/normalizeAmount.ts` — never duplicate this logic.

## Architecture

- React 18 + TypeScript strict + Vite, PWA (`vite-plugin-pwa`), deployed to GitHub Pages under `base: '/explorResource/'` with `HashRouter`.
- Tailwind CSS v4 consuming `src/index.css` (verbatim copy of provided branding — never rewrite it).
- IndexedDB (`idb`) as source of truth via a validated repository layer (`src/persistence/`); JSON export/import for backup (critical feature, not optional).
- Excel import (`xlsx`, Web Worker) must read **cell comments** for real monthly demand/supply — the raw cell numeric value in demand rows is a gap (`demand − supply`), not raw demand.
- State via Context/hooks/`useReducer`, no Redux. Validation via `zod`. Forms via `react-hook-form`.

## Conventions

- Path alias `@/*` → `src/*`. Pure domain logic (`src/domain/**`) must be framework-free and unit-testable.
- One zod schema + inferred type per entity, barrel-exported from `src/domain/entities/index.ts`.
- Every mouse/drag-and-drop interaction needs a full keyboard/form alternative.

## Calculation rules (do not reinvent — see `docs/business-rules.md`)

```
capacitéNette = max(0, joursTravaillésDuMois − joursNonTravaillés)
capacitéDisponible = capacitéNette − chargeAffectée
chargeNonAffectéeProjet = max(0, demandeProjet − affectationsProjet)
tauxUtilisation = chargeAffectée / capacitéNette * 100 (0 if capacitéNette = 0 and chargeAffectée = 0; surcharge critique if capacitéNette = 0 and chargeAffectée > 0)
```

Overload is always allowed, never blocks saving, always visually flagged (label + icon + value + tooltip — never color alone).

## Testing requirements

- Unit tests for every calculation/normalization/classification/comparison rule.
- Component tests for forms, tables, wizards, filters, indicators.
- Playwright E2E covering the acceptance scenarios in `docs/functional-specification.md`.
- Never mark a lot complete if its required tests fail; run commands for real, don't assume.

## Accessibility

WCAG 2.2 AA. Keyboard navigation, visible focus, ARIA labels, `prefers-reduced-motion`, never color-only signals.

## Persistence & GitHub Pages

- Migrations in `src/persistence/db.ts` are versioned and additive.
- Backup restore is atomic and schema-validated; never partially apply a corrupt backup.
- Never break the `/explorResource/` base path or `HashRouter` GitHub Pages compatibility.

## Hard rules

No backend, no authentication, no secrets, no silent Excel row drops, no silent data deletion, no unverified test/build claims.
