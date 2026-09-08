---
title: Accessibility
id: accessibility
status: living
last_updated: 2026-09-08
---

# Accessibility

Target: **WCAG 2.2 AA**.

## Commitments

- Full keyboard navigation for every action, including a non-drag-and-drop path for every drag-and-drop interaction (Allocation Studio).
- Route transitions use lazy loading with a visible loading message (`role="status"`), not a spinner-only fallback.
- Visible focus indicator (`:focus-visible`, already defined in `src/index.css`).
- Explicit form labels, assertive/polite live regions for import, save, restore, reset, and anomaly feedback.
- Exactly one application `<main>` landmark at the shell level; each routed page keeps a single visible `<h1>`.
- Confirmation dialogs trap focus, support <kbd>Escape</kbd>, and return focus to the triggering control when closed.
- Accessible data tables (headers, scope, captions where useful) even when virtualized.
- Sufficient color contrast in both light and dark themes (tokens already defined in `src/index.css`).
- Zoom support; no fixed-pixel layouts that break reflow.
- `prefers-reduced-motion` respected, with non-essential hover and entrance motion guarded by `@media (prefers-reduced-motion: no-preference)`.
- Readable, specific error messages (not just color/icon).
- **No information is ever conveyed by color alone** — every status/threshold indicator pairs a label, an icon, a numeric value, and an accessible tooltip.

## Verification

Component/E2E tests include keyboard-only and axe-core-based checks for Dashboard, Resources, and Allocation Studio, plus primary-navigation keyboard coverage in Playwright (see `testing-strategy.md`). Manual verification checklist tracked in `traceability-matrix.md`.
