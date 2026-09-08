---
title: Business Rules
id: business-rules
status: living
last_updated: 2026-09-08
---

# Business Rules

## Planning year

- Always January → December. Not configurable.
- Time views: year, S1, S2, Q1, Q2, Q3, Q4, and a custom month range within a single year.

## Workload values

- All demand/allocation/capacity/absence values are expressed in **days**, decimals allowed, stored as unrounded `number`.
- Display shows at most one decimal; stored precision is preserved.
- Both `.` and `,` are accepted as decimal separators in input fields.
- Negative user input is rejected (validation error, not silently clamped).
- Tiny floating-point residue (e.g. `4.4408920985006262e-16`, confirmed in the real source file) is normalized to `0` via a single centralized function with a configurable tolerance (default `1e-6`), never re-implemented ad hoc.
- Overload is allowed, never blocks saving, and must always be visually flagged (label + icon + value + accessible tooltip).

## Capacity & workload formulas

```
capacitéBrute(resource, year, month)   = nombreDeJoursTravaillésDuMois(year, month)
capacitéNette(resource, year, month)   = max(0, capacitéBrute − joursNonTravaillés(resource, year, month))
chargeAffectée(resource, year, month)  = Σ Allocation.allocatedDays for that resource, that month, all projects
capacitéDisponible(resource, year, month) = capacitéNette − chargeAffectée
chargeNonAffectéeProjet(project, resourceType, year, month) = max(0, demandeProjet − Σ affectations correspondantes)
tauxUtilisation(resource, year, month) = chargeAffectée / capacitéNette * 100
```

Edge cases:

- `capacitéNette = 0` and `chargeAffectée = 0` → `tauxUtilisation = 0`.
- `capacitéNette = 0` and `chargeAffectée > 0` → flagged as **surcharge critique** (critical overload), regardless of the computed percentage.
- `capacitéDisponible < 0` → overload.

Visual thresholds (configurable in `AppSettings`, defaults):

- `< 80%` → available (green)
- `80–100%` → used (yellow)
- `100–110%` → overload (orange)
- `> 110%` → critical overload (red)

Never convey these states by color alone — always pair with a label, icon, numeric value, and accessible tooltip.

## Projects

- Functional key: `code`, matching `^[EPR]\d{4}$`.
- Codes that do not match this pattern (confirmed real examples: `GIS0006`, `GIS0010`, `GIS0022`, `GIS0097`, `GIS0112`, `GIS0114`, `GIS0120`, `RUN0001`, `RUN0040`) are imported as read-only `Group` entities, never as `Project`, and never merged/renamed silently.
- Projects are never merged by name — only by normalized (uppercase) code.

## Releases

- One go-live date per release. A project can ship on 0..N releases; a release can be linked to N projects.
- Archive rather than hard-delete a release already referenced by a project.

## Resources

- One `ResourceType` at a time. `companyId` is **required** if `collaborationType = external`, optional if `internal`.
- Soft-archive resources with history; never hard-delete them.

## Allocations

- A resource can only be allocated against a demand of a compatible `ResourceType`.
- A demand can be split across multiple resources; a resource can be allocated to multiple projects.
- Decimal allocations allowed. Overload allowed. Allocation exceeding demand is allowed but flagged as **over-service**.
- Every allocation change immediately recomputes all dependent indicators.

## Import comparison

- Default comparison: current import vs. the immediately preceding validated import. Manual comparison between any two imports is also available.
- Comparison key: `projectCode + resourceType + year + month`.
- `delta = nouvelleDemande − demandePrécédente`.
- States: new project, removed project, demand increased/decreased/unchanged, resource type added/removed on a project.
- Positive and negative deltas are always shown **separately** (cumulated positive, cumulated negative, net) — never silently netted out.

## Deletion vs. archiving

Soft-delete (archive) everywhere by default. Hard delete only permitted when an entity has zero references across the data model.
