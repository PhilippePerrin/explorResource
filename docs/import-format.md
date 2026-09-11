---
title: Import Format
id: import-format
status: living
last_updated: 2026-09-11
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

Rounding note (2026-09-10): the export tool always rounds Demand/Supply to 1 decimal in the comment text, while the gap cell keeps full unrounded precision. Reconstructing `demand − supply` from the comment can therefore differ from the real gap cell by up to ~0.1 day (two independent roundings) even when nothing is wrong. The `comment-gap-mismatch` anomaly check tolerates this (`COMMENT_GAP_ROUNDING_TOLERANCE_DAYS` in `src/import/parse.ts`) and only flags larger discrepancies.

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

## Team Calendar (Non-working Days) import

Based on real inspection of `data/Team Calendar.xlsx` (sheet `Presence`), used to fill `ResourceNonWorkingDays` (`src/teamCalendarImport/**`, page `/non-working-days/import`).

### Source and layout

The team records absences by hand in a shared "Team Calendar" workbook — a different tool/format from the PSA demand export above, with **no cell comments** at all. Sheet `Presence`: columns A–F carry a small legend (see below), column G lists one resource per row ("Firstname LASTNAME", one inconsistency observed in the real file: two rows use non-uppercase last names), and one column per calendar day starts right after it. Row landmarks (located dynamically at parse time by searching for the sheet's own "Month" header cell, never hard-coded row numbers, since this file is hand-maintained and rows can shift):

- The row holding the "Month" label also holds the month abbreviation (English, `Jan`..`Dec`) for every data column.
- A row above it (found by scanning upward for the first plausible 4-digit year) holds the calendar year per data column.
- Resource rows are every row below the header block whose name-column cell is non-empty and isn't one of the header labels ("Week"/"Day").

Only the year + month per column are used (not the exact day), because `ResourceNonWorkingDays` stores a single aggregate `days` figure per resource/year/month — there is no per-date storage in this app.

### Decoding a cell: no comments, only text + fill color

Absences are signaled by a handful of text values and the cell's solid background fill, decoded against the sheet's **own legend** (a color swatch sits directly next to each legend label in cells A1/A2/A6, next to B1 `PTO`, B2 `Travelling > mention the location`, B6 `Site closed / Bank holidays`):

| Signal | Legend meaning | Days counted |
| --- | --- | --- |
| Text `AM` or `PM`, no PTO fill | half-day absence | 0.5 |
| Solid fill `C00000` (dark red), no text | PTO (confirmed by real block-shaped date ranges matching plausible vacation patterns) | 1.0 |
| Solid fill `C00000` **with** any text (`AM`/`PM`/other) | conflicting signal — the file has a few cells with both | 0.5 (text wins), flagged as a `conflicting-marking` warning |
| Solid fill `FFFF00` (yellow), legend "Travelling" | resource is still working, just elsewhere | 0 (never counted, even with a location note in the cell) |
| Solid fill `theme 0` with a dark tint, legend "Site closed / Bank holidays" | company-wide closure, uniform across every resource on the same ~10-12 columns | 0 at the resource level (assumed already reflected in the global `WorkingDaysCalendar`) |
| The sheet's default banding fill (`DEEBF7`), applied almost everywhere | not semantic, ignore | 0 |
| Any other solid fill, or unrecognized text with no meaningful fill | undocumented in the file's own legend | 0, flagged as an `unrecognized-marking` warning (never guessed) |

Decoding logic lives in `src/teamCalendarImport/decode.ts` (`classifyCalendarFill`, `decodeCalendarCell`) — pure, framework-free, and unit-tested against every row of the table above.

### Name matching

Column G names are matched to `Resource.firstName + ' ' + lastName` case- **and** accent-insensitively (`normalizePersonName`, NFD-normalized), unlike the exact-match-only demand/resource imports, because the real file has both accented names and inconsistent casing. A name that still doesn't match any **active** resource — whether it's absent from the resource list entirely, or present but archived — raises a **non-blocking** `unknown-resource` warning and that resource's rows are excluded from the staged totals; it is never silently dropped (the warning names the row and the resource, and `statistics.unmatchedResourceRows` counts it) and never auto-created. This keeps one unresolved name from holding up every other resource's import — fix the name or activate/create the resource and re-import to pick up just that one.

### Commit semantics

For every resource/year/month the file has a signal for, the import **replaces** whatever is currently on the Non-working Days grid for that cell (the file becomes the source of truth for the months it covers); months/resources it has no signal for are left untouched. This reuses the grid's own `createNonWorkingDayMutationPlan` (`src/features/non-working-days/nonWorkingDaysModel.ts`) rather than a separate write path, so manual edits and imported edits stay consistent.

### Wizard steps

1. File selection → 2. Preview (staged resource/month totals) → 3. Anomaly review → 4. Commit → 5. Final report (downloadable Markdown).
