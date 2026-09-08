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
- Visible focus indicator (`:focus-visible`, already defined in `src/index.css`).
- Explicit form labels, ARIA live regions for import progress/anomalies.
- Accessible data tables (headers, scope, captions where useful) even when virtualized.
- Sufficient color contrast in both light and dark themes (tokens already defined in `src/index.css`).
- Zoom support; no fixed-pixel layouts that break reflow.
- `prefers-reduced-motion` respected (already implemented globally in `src/index.css`).
- Readable, specific error messages (not just color/icon).
- **No information is ever conveyed by color alone** — every status/threshold indicator pairs a label, an icon, a numeric value, and an accessible tooltip.

## Verification

Component/E2E tests include keyboard-only and axe-based checks where practical (see `testing-strategy.md`). Manual verification checklist tracked in `traceability-matrix.md`.
