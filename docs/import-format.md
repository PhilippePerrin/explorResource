---
title: Import Format
id: import-format
status: living
last_updated: 2026-09-08
---

# Import Format

Based on real inspection of `data/export-philippe.perrin-151251-20260908-101608.xlsx` (see `ai.memory`, 2026-09-08, for the raw findings).

## Source

Export from a PSA/resource-management tool (defined names prefixed `ATT__RM_...` suggest Certinia/OpenAir-style "Resource Management" reporting). Sheet `DemandWorkload` (visible), sheet `plw-metadata` (hidden, 2 rows, tool-internal — not used).

## Row hierarchy

1. **Group row** — column A only, code does not match `^[EPR]\d{4}$` (e.g. `GIS0006 - GCOE`, `RUN0001 - Customer Solution RUN Activities`). Style `33` in the real file.
2. **Project row** — column A only, code matches `^[EPR]\d{4}$` (e.g. `E0100 - Commercial Analytics`). Style `30` in the real file. May appear directly under a Group row or standalone.
3. **Demand row** — column C (`Status`) populated (e.g. `Published`, `Published (demand modified)`), column D = a known **resource type label** (e.g. `Commerce - SFDC Developer - EUR`), column E = activity/project name, `Total supply`/`Total demand` columns populated, monthly columns I–T = **gap**, not raw demand (see below).
4. **Supply/assignment row** — column C empty, column D = a real **person name** ("Firstname LASTNAME"), monthly columns I–T = days already assigned to that person (positive values).

The source file itself flags 34 non-data rows (header + all group/project rows) via defined names `NO_IMPORT1..NO_IMPORT34` — a useful secondary classification signal, but classification must remain multi-criteria (see below), never relying on this or the style alone, since it is specific to this exact export tool version.

## Critical parsing detail: gap vs. raw demand

The numeric value of a monthly cell (columns I–T, Jan–Dec) on a **demand row** is `demand − supply` (a gap), not the raw demand. The real values (`Demand : X (Day) / Y (FTE)` and `Supply : X (Day) / Y (FTE)`) are stored as **Excel cell comments** on that same cell (see `comments1.xml` in the xlsx zip).

Parsing strategy (decided 2026-09-08):

1. Parse the comment text on each monthly cell of a demand row with a regex extracting `Demand : ([\d.]+) \(Day\)` and `Supply : ([\d.]+) \(Day\)`.
2. If both values are found, use them directly.
3. If the comment is missing or does not match the expected pattern, fall back to: `supply = 0` (or the row's supply-row total if determinable), `demand = supply + cellValue`, and flag the row/cell as an anomaly ("derived from gap, not confirmed by comment").

Implementation note (Lot 7, 2026-09-08): the repository implementation first **verified experimentally** that the existing `xlsx` dependency (`0.18.5`) exposes the real workbook comments through `worksheet[cellRef].c` when read with `cellComments: true` / `cellStyles: true`. That path worked on the provided production fixture, so no manual zip/XML fallback was added at this stage.

## Classification criteria (combined, never style-only)

- Project-code regex on column A.
- Known resource-type label in column D.
- Known resource name pattern in column D (and absence from the resource-type list).
- `Total supply` / `Total demand` column values.
- Hierarchical position (row directly following a Group/Project row).
- Excel style (secondary signal only).
- Content of `Status`, `Resource`, `Activity` columns.
- Real-person rows may still classify as **supply** even if `Status` is unexpectedly populated (real fixture example: row 99 = `Simulation` + `Mustapha ELMADI`), because classification stays multi-criteria instead of trusting any one column blindly.

Any row that cannot be classified with confidence is presented to the user in the import wizard — never silently dropped or ignored.

## Normalization on import

- Trim whitespace; preserve accents/casing for display; compare project codes uppercased.
- Distinguish `0`, empty cell, and invalid data explicitly (empty ≠ 0 unless business meaning is unambiguous).
- Normalize near-zero floating point noise (confirmed real example: `-4.4408920985006262e-16`) via the shared `normalizeAmount` utility.
- Flag: duplicate rows, unnamed projects, unknown resource types, unknown resources, unparsable month/year headers.

## Duplicate detection

SHA-256 of the raw file bytes (Web Crypto API, computed client-side) is compared against all existing `ImportBatch.fileSha256` values.

## Wizard steps

1. File selection → 2. Technical analysis → 3. Preview → 4. Column/type mapping → 5. Row classification → 6. Anomaly review → 7. Comparison with previous import → 8. Validation → 9. Atomic import → 10. Final report (downloadable Markdown in the current implementation).
