---
title: Accessibility
id: accessibility
status: living
last_updated: 2026-09-11
---

# Accessibility

Target: **WCAG 2.2 AA**.

## Commitments

- Full keyboard navigation for every action, including a non-drag-and-drop path for every drag-and-drop interaction. Allocation Studio: arming a resource card with Enter/Space then activating a demand-line cell, an assignment-line cell, or the row's own "Add across all visible months" button all produce the same result a drop onto that target would — the multi-month review panel (or, for editing a single existing assignment cell, the same single-month quick-assign panel a drop there would open). An always-available "Add allocation…" button covers add/set/move without dragging or arming anything, including moving an existing allocation between projects (the drag-only interaction for that move has no dedicated keyboard equivalent beyond this form, since the redesign did not change that interaction).
- Route transitions use lazy loading with a visible loading message (`role="status"`), not a spinner-only fallback.
- Visible focus indicator (`:focus-visible`, already defined in `src/index.css`).
- Explicit form labels, assertive/polite live regions for import, save, restore, reset, and anomaly feedback.
- Exactly one application `<main>` landmark at the shell level; each routed page keeps a single visible `<h1>`.
- Confirmation dialogs trap focus, support <kbd>Escape</kbd>, and return focus to the triggering control when closed.
- Accessible data tables (headers, scope, captions where useful). The Capacity Command Center heatmap renders every matching resource row directly (no virtualization/inner-scroll clipping), so all rows stay in the accessibility tree and reachable by keyboard without a scroll-to-reveal step.
- Sufficient color contrast in both light and dark themes (tokens already defined in `src/index.css`).
- Zoom support; no fixed-pixel layouts that break reflow.
- `prefers-reduced-motion` respected, with non-essential hover and entrance motion guarded by `@media (prefers-reduced-motion: no-preference)`.
- Readable, specific error messages (not just color/icon).
- **No information is ever conveyed by color alone** — every status/threshold indicator pairs a label, an icon, a numeric value, and an accessible tooltip. Icons (`lucide-react`, via `src/components/icons.ts`) are always `aria-hidden` and purely decorative; the label/value/tooltip carry the actual meaning.
- The grouped sidebar navigation (`src/app/Sidebar.tsx`) keeps a single `<nav aria-label="Primary">` landmark, the skip link as the first focusable element, and exactly one `<main id="main-content">` landmark — unchanged from the flat top-nav it replaced. Collapsed-sidebar mode keeps each nav item's full label in the DOM (visually hidden, not `aria-hidden`) so its accessible name never depends on the collapse state.
- Light/dark/system theme (`src/theme/applyTheme.ts`, Settings → Appearance) is a user preference, not a requirement — both themes independently satisfy the contrast and non-color-alone commitments above.
- New interactive primitives (`src/components/ui/Tabs.tsx`, `Tooltip.tsx`, `IconButton.tsx`) are keyboard-operable: `Tabs` implements roving tabindex with arrow-key/Home/End navigation and `role="tablist"`/`role="tab"`; `Tooltip` reveals on focus (not hover-only) and dismisses on <kbd>Escape</kbd>; `IconButton` requires an explicit accessible name.
- The sidebar (`src/app/Sidebar.tsx`) is pinned to the viewport on desktop (`position: sticky`) purely as a visual/layout change — it keeps the same single `<nav aria-label="Primary">` landmark and DOM order, so it does not alter the existing keyboard/landmark commitments above.
- The Demand Coverage Board's monthly tiles (`src/features/demand-coverage/DemandCoverageBoardPage.tsx`) are native `<button>` elements with a full `aria-label` (project, resource type, month, and coverage summary), reachable by <kbd>Tab</kbd> and activated with <kbd>Enter</kbd>/<kbd>Space</kbd> — opening the same resource-detail `Drawer` a mouse click would, with no drag-and-drop involved.
- The header's database-backup export icon (`src/app/AppShell.tsx`, via `IconButton`) has an explicit "Export database backup" accessible name and a `role="status"` live region announces the "Backup exported." confirmation next to it.

## Verification

Component/E2E tests include keyboard-only and axe-core-based checks for Dashboard, Resources, and Allocation Studio, plus primary-navigation keyboard coverage in Playwright (see `testing-strategy.md`). Manual verification checklist tracked in `traceability-matrix.md`.
