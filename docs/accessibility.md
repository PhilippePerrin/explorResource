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
- **No information is ever conveyed by color alone** — every status/threshold indicator pairs a label, an icon, a numeric value, and an accessible tooltip. Icons (`lucide-react`, via `src/components/icons.ts`) are always `aria-hidden` and purely decorative; the label/value/tooltip carry the actual meaning.
- The grouped sidebar navigation (`src/app/Sidebar.tsx`) keeps a single `<nav aria-label="Primary">` landmark, the skip link as the first focusable element, and exactly one `<main id="main-content">` landmark — unchanged from the flat top-nav it replaced. Collapsed-sidebar mode keeps each nav item's full label in the DOM (visually hidden, not `aria-hidden`) so its accessible name never depends on the collapse state.
- Light/dark/system theme (`src/theme/applyTheme.ts`, Settings → Appearance) is a user preference, not a requirement — both themes independently satisfy the contrast and non-color-alone commitments above.
- New interactive primitives (`src/components/ui/Tabs.tsx`, `Tooltip.tsx`, `IconButton.tsx`) are keyboard-operable: `Tabs` implements roving tabindex with arrow-key/Home/End navigation and `role="tablist"`/`role="tab"`; `Tooltip` reveals on focus (not hover-only) and dismisses on <kbd>Escape</kbd>; `IconButton` requires an explicit accessible name.

## Verification

Component/E2E tests include keyboard-only and axe-core-based checks for Dashboard, Resources, and Allocation Studio, plus primary-navigation keyboard coverage in Playwright (see `testing-strategy.md`). Manual verification checklist tracked in `traceability-matrix.md`.
