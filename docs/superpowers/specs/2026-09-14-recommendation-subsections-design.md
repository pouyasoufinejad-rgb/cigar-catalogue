# Recommendation Subsections Rebuild

## Status

Approved architectural design for replacing the current Recommendation subsection overlay with first-class, persistent subsection structures.

## Problem

Recommendation subsection ranking is currently implemented as an overlay on top of the catalogue's older global ranking and DOM structure. The Recommendation controller infers subsection membership from cigar attributes, reuses legacy DOM sections, falls back to legacy/global `rank`, rewrites the same rank badge used by other catalogue modules, and participates in the shared save-transform pipeline after other cohort transforms. This creates multiple competing owners for membership, rank, and rank presentation.

The resulting failure mode is visible rank instability: Recommendation subsection numbers can reset, fight other ranking logic, follow a card between sections, or be rebuilt differently after reload. The architecture also prevents the editor from treating Recommendation subsections as editable catalogue structures.

The rebuild must make Recommendation subsections behave as true independent cohorts while preserving Half-Cigar and Taster as their own top-level catalogue types.

## Goals

1. Make Recommendation subsections first-class persistent catalogue entities.
2. Make subsection names, descriptions, and order editable.
3. Let the user create new Recommendation subsections.
4. Let the user move Recommendation entries between subsections and choose their destination position.
5. Let archived entries be restored directly to any Recommendation subsection, Half-Cigar, or Taster, with an explicit destination position.
6. Guarantee contiguous, independent Recommendation numbering per subsection.
7. Remove runtime inference of Recommendation membership after migration.
8. Give Recommendation rank rendering a single owner so no other module rewrites the same Recommendation number state.
9. Preserve unrelated catalogue data during migration and edits.
10. Keep current Half-Cigar and Taster semantics intact.

## Non-goals

- Changing Value calculation.
- Rewriting cigar prose, ratings, prices, images, eyebrow text, or retailer data.
- Reclassifying entries continuously based on ring gauge, flavour wording, or other cigar metadata.
- Turning Recommendation subsections into top-level catalogue types.
- Merging Half-Cigar or Taster into Recommendation subsection logic.

## Chosen Architecture

Use section-owned ordered entry lists.

Recommendation subsections are stored as persistent objects. Each subsection has a stable ID, editable display metadata, display order, and an ordered array of entry keys. The visible Recommendation rank is derived from the entry's position in the subsection's ordered list rather than persisted independently on each card.

Conceptual state:

```json
{
  "recommendationSubsections": [
    {
      "id": "coronets",
      "name": "Coronets",
      "description": "...",
      "entryKeys": ["blackened-m81-coronets", "liga-privada-no9-coronets"]
    },
    {
      "id": "petit-panatelas",
      "name": "Petit Panatelas",
      "description": "...",
      "entryKeys": []
    },
    {
      "id": "flavoured",
      "name": "Infused / Flavoured",
      "description": "...",
      "entryKeys": []
    }
  ]
}
```

Array position defines subsection display order. `entryKeys` position defines the card's local Recommendation rank.

This deliberately avoids a separate `recommendationRank` field because duplicated rank state is the source of the current fragility.

## Core Invariants

The save layer must enforce these invariants atomically:

1. Every active Recommendation entry belongs to exactly one Recommendation subsection.
2. No active entry key may appear more than once across Recommendation subsection lists.
3. Half-Cigar and Taster entries may not appear in Recommendation subsection lists.
4. Archived entries may not appear in an active Recommendation subsection list.
5. Recommendation ranks are always derived as `entryKeys index + 1` and therefore are contiguous by construction.
6. Subsection IDs are stable identifiers and are not changed by renaming the subsection.
7. Empty subsections are valid and persist across reloads.
8. A subsection containing entries cannot be deleted until its entries are moved or archived.

Invalid state must fail the save instead of being silently normalised into an ambiguous result.

## State Model

The catalogue state remains a single authoritative KV document. The Recommendation subsection structure should live in a dedicated top-level field such as `recommendationSubsections`, rather than being encoded in per-card prose, DOM structure, or inferred metadata.

The state normaliser must:

- accept the new field;
- sanitise subsection IDs, names, descriptions, and entry key arrays;
- preserve empty subsections;
- reject duplicate subsection IDs;
- reject duplicate entry membership across subsections;
- maintain compatibility with older state during the migration window;
- avoid manufacturing new membership from ring gauge or flavour metadata once explicit subsection state exists.

Per-card legacy `rank`, `recommendationCohort`, and `recommendationRank` may be read only for migration/compatibility as needed. They are not authoritative for Recommendation display order after migration.

## Recommendation Membership Engine

Create one focused Recommendation subsection state module with pure functions for:

- validating subsection state;
- deriving entry-to-subsection membership;
- moving an entry within one subsection;
- moving an entry between subsections;
- adding a subsection;
- renaming/editing a subsection;
- reordering subsections;
- deleting an empty subsection;
- removing an entry when archived or moved to Half-Cigar/Taster;
- inserting an entry when restored or moved into Recommendation;
- deriving local display rank from subsection list position.

This module owns Recommendation membership and ordering. DOM controllers and editor code consume it rather than reimplementing ordering rules.

## Relationship to Half-Cigar and Taster

Half-Cigar and Taster remain distinct catalogue types and keep their own compact rankings and visual prefixes (`H1`, `H2`, and `T1`, `T2`).

Cross-type moves must be coordinated centrally so source and destination state update together:

- Recommendation -> Half-Cigar: remove from Recommendation subsection list, then insert into Half-Cigar rank position.
- Recommendation -> Taster: remove from Recommendation subsection list, then insert into Taster rank position.
- Half-Cigar/Taster -> Recommendation: remove/compact the source cohort, then insert into the chosen Recommendation subsection and position.
- Any active type -> Archive: remove from its active ranking structure and preserve archive metadata.
- Archive -> Recommendation/Half-Cigar/Taster: require an explicit destination and position, then insert atomically.

No Recommendation operation may renumber Half-Cigar or Taster except when an entry is explicitly moved into or out of that cohort.

## Editor Design

The unified editor should expose catalogue structure explicitly.

### Entry editing

For an active entry, show a catalogue type control:

- Recommendation
- Half-Cigar
- Taster

When `Recommendation` is selected, show:

- Recommendation subsection dropdown populated from persistent subsection state;
- local position/rank input scoped only to the selected subsection.

When Half-Cigar or Taster is selected, show that cohort's local position input using the existing H/T ranking semantics.

Changing type or subsection is a structural move. The editor preview and save plan must be computed against one shared state engine rather than chained transforms that independently mutate rank fields.

### Subsection manager

Add a Recommendation subsection management area that supports:

- create subsection;
- edit display name;
- edit description;
- reorder subsections;
- delete an empty subsection.

Subsection IDs are generated once and remain stable even when the user renames the subsection.

A subsection with entries cannot be deleted. The editor should explain that the entries must first be moved or archived.

### Archive restoration

For an archived entry, restoring it must require choosing a destination:

- Recommendation -> subsection -> position;
- Half-Cigar -> H position;
- Taster -> T position.

This makes restoration deterministic instead of relying on stale `archivedRank`, inferred membership, or prior global rank.

## Rendering

Replace the existing Recommendation overlay controller with a renderer driven directly by persistent subsection state.

For each persisted Recommendation subsection, the renderer creates or updates a real subsection container using the stable subsection ID. It must not relabel/reuse legacy Elite/Strong/Noteworthy DOM sections as Recommendation sections.

The renderer places each Recommendation card into the container named by explicit membership and displays `No. N` based solely on its position in `entryKeys`.

Recommendation rank rendering has one owner. Other modules must not rewrite the Recommendation card rank flag. Half-Cigar and Taster continue to own their H/T visuals for their own cards.

The renderer must not observe cigar prose or metadata to decide membership. Attribute/DOM observers, if still required for unrelated dynamic rendering, must not trigger classification or reorder loops.

## Save Pipeline Refactor

The current chained transform model allows multiple modules to mutate overlapping rank state. For structural catalogue changes, replace this with one structural save calculation that receives the full current state plus the requested move/edit and returns the complete validated structural result.

Editorial fields remain merge-preserving and independent from structural movement.

The structural calculation must be atomic from the editor's point of view: source removal, destination insertion, archive state, catalogue type, and Recommendation subsection state are calculated together before the PUT.

Existing save transforms that only exist to retrofit Recommendation rank/cohort fields should be removed after migration. Half-Cigar compatibility code may remain only where it does not compete with the new central structural calculation.

## Migration

Migration is one-time and conservative.

1. Read the authoritative live KV state.
2. Build initial Recommendation subsection lists for the existing sections: Coronets, Petit Panatelas, and Infused / Flavoured.
3. Preserve the currently intended relative order of entries in each existing subsection.
4. Existing inferred rules (ring gauge/flavour) may be used only to fill gaps where live explicit state does not already determine membership.
5. Preserve all unrelated card and entry fields byte-for-byte where practical.
6. Write the new subsection structure only after the production code can read it.
7. Verify live KV read-back and production rendering after migration.

After migration, automatic membership inference is disabled for normal runtime/editor behaviour.

The previous PR #76 seed-only strategy is superseded by this design and must not be merged as the solution.

## Deployment Sequence

To avoid a code/state mismatch:

1. Implement and test backwards-compatible code that can read old state and new subsection state.
2. Deploy the code to Cloudflare.
3. Confirm production is running the new compatible code.
4. Run the one-time live-state migration to create explicit Recommendation subsection structures.
5. Read back live KV.
6. Verify the production UI and editor against the migrated state.
7. Remove obsolete fallback/inference code only when migration verification proves it is no longer needed, or keep narrowly scoped read compatibility if required for rollback safety.

Catalogue publication and code deployment remain separate concerns. Do not treat a Git merge as proof that production frontend code has deployed.

## Error Handling

Structural saves should reject and report:

- duplicate subsection IDs;
- duplicate active Recommendation membership;
- an active Recommendation with no subsection;
- archived/Half/Taster entries present in Recommendation lists;
- target subsection that does not exist;
- out-of-range requested positions after normalisation rules are applied;
- deletion of a non-empty subsection.

The editor should leave the current catalogue untouched when structural validation fails.

## Testing Strategy

Add pure unit tests for the new Recommendation subsection state engine and integration tests for editor/save/render behaviour.

Required regression coverage:

1. Each subsection independently displays `1..N`.
2. Moving within one subsection changes only that subsection order.
3. Moving between Recommendation subsections compacts the source and inserts into the destination without touching other subsections.
4. Renaming a subsection preserves stable ID, membership, and ordering.
5. Reordering subsections changes only subsection display order.
6. Creating an empty subsection persists after reload.
7. Deleting an empty subsection succeeds.
8. Deleting a non-empty subsection fails without state mutation.
9. An entry cannot appear in two Recommendation subsections.
10. Every active Recommendation must belong to exactly one subsection.
11. Moving Recommendation -> Half-Cigar compacts the source subsection and updates only Half-Cigar as the destination.
12. Moving Recommendation -> Taster behaves equivalently.
13. Moving Half-Cigar/Taster -> Recommendation requires a subsection and destination position.
14. Archiving removes an entry from its active ranking structure.
15. Restoring from archive can target any Recommendation subsection, Half-Cigar, or Taster.
16. Reload preserves subsection names, order, membership, and local ordering exactly.
17. Recommendation rank rendering does not alter eyebrow text.
18. Joya Black remains wherever it is explicitly assigned and is never moved because prose contains flavour-related wording.
19. Runtime no longer reuses legacy Elite/Strong/Noteworthy sections as Recommendation subsection containers.
20. Runtime no longer falls back to legacy global `rank` for Recommendation ordering once explicit subsection state exists.
21. Half-Cigar and Taster ranks remain independent and contiguous.
22. Migration preserves unrelated catalogue fields.
23. Live migration tooling verifies read-back before reporting success.

## Acceptance Criteria

The rebuild is complete only when:

- Recommendation subsection numbering remains stable across save, reload, and production refresh;
- the user can create, rename, describe, and reorder Recommendation subsections;
- the user can move entries between Recommendation subsections with explicit local positioning;
- archived entries can be restored to any Recommendation subsection, Half-Cigar, or Taster;
- Recommendation membership is explicit and persistent rather than inferred;
- no Recommendation rank falls back to global rank;
- no two modules compete to render a Recommendation number badge;
- all structural invariants are validated on save;
- automated tests pass;
- production code is deployed before live schema migration;
- live KV read-back and production rendering are verified after migration.

## Superseded Work

PR #76, `Persist independent recommendation subsection ranks`, is not the implementation path for this rebuild. It can be closed as superseded once this design is adopted into the implementation branch. Its diagnostic lessons remain useful, but its `recommendationCohort`/`recommendationRank` seed model would preserve duplicated per-card rank state and therefore conflicts with the architecture above.
