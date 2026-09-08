---
title: Product Vision
id: product-vision
status: living
last_updated: 2026-09-08
---

# Product Vision

## Who is this for?

A single **Domain Manager** who needs to plan team capacity, track incoming project demand, and allocate resources across projects and releases — without any IT dependency, server, or login.

## Problem

Today, this data lives in spreadsheets exported from a PSA/resource-management tool (see `import-format.md`). These exports are hard to compare over time, hide real numbers behind cell comments, and give no interactive way to see overload, unassigned demand, or capacity at a glance.

## Vision

A fast, accessible, local-first PWA that:

- imports the existing Excel exports without any manual reformatting;
- keeps every import as an immutable, comparable version;
- turns static numbers into an interactive capacity/demand cockpit (dashboard, heatmap, coverage board, allocation studio);
- never loses data (local persistence + mandatory backup/restore);
- works fully offline after first load, deployed for free on GitHub Pages.

## Non-goals

No multi-user support, no authentication, no server, no approval workflow, no external telemetry. Explicitly out of scope unless a future, dated decision says otherwise (see `ai.memory`).

## Definition of "done"

See the acceptance criteria in `functional-specification.md` and the final checklist in `traceability-matrix.md`. In short: the real Excel file imports cleanly, all CRUD screens work, capacity/overload calculations are correct and visible, backup/restore round-trips losslessly, the app works offline and deploys correctly under `/explorResource/` on GitHub Pages, and the full test suite (unit + component + E2E) passes.
