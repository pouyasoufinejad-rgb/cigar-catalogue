# Handoff: cigar-catalogue CI-red / stuck-deploy incident (2026-09-18)

Written by Claude after investigating why production has felt "constantly rolled back"
since ~2026-09-17/18. Short version: **nothing is silently corrupting further. One
reverted line of logic has blocked every deploy for ~4.5 hours. Production is very
likely already sitting on a correctly-repaired state that just never got a chance to
be built on.**

## The actual timeline (all times UTC; local commit timestamps are UTC+8)

1. A sidebar/control-panel feature shipped and corrupted `productionLines`,
   `practicalLines`, and `retailerLinks` on ~94 catalogue cards in the live
   Cloudflare KV store (`CATALOGUE_STATE`).
2. `scripts/repair-pre-sidebar-live-state.mjs` was written to replay
   `catalogue-requests/*.json` history against commit `8ba8f65` (`PRE_SIDEBAR_TARGET`,
   the last known-good pre-sidebar tree from Sep 16) and reconstruct the correct
   fields, running them through the existing house-style normalizer
   (`normaliseProductionLines`/`normalisePracticalLines` in
   `scripts/normalise-live-card-structure.mjs`).
3. At commit `03e9b9f`, this was wired correctly. Workflow run
   [35305640550](https://github.com/pouyasoufinejad-rgb/cigar-catalogue/actions/runs/35305640550)
   (2026-09-18T04:06–04:07Z) **actually executed the repair against production** and
   printed:
   ```
   PRE_SIDEBAR_REPAIR_SUMMARY {"changedKeys":94,"changes":310, ...}
   Saved pre-repair live-state backup to pre-repair-live-state.json.
   Pre-sidebar field repair verified: 94 keys, 310 field writes, 95 rendered cards.
   ```
   This included real retailer-link corrections (adds/removals against CigarHut,
   CigarWorld, The Index, Firmin Cigars, etc.) and dimension/construction line fixes.
   The pre-repair KV snapshot was uploaded as the workflow artifact
   `pre-sidebar-repair-live-state-35305640550` (30-day retention from that date) —
   grab it now if you want a pre-recovery audit trail.
4. **90 seconds later**, commit `3c05113` ("fix: replay exact pre-sidebar card
   fields") **reverted the normalization wiring**, going back to writing raw
   ledger/live/seed lines verbatim. This broke
   `test/repair-pre-sidebar-live-state.test.mjs`, which had been updated (commit
   `e4f2037`) to assert normalized output.
5. Because `.github/workflows/publish-catalogue.yml`'s `publish` job has
   `needs: verify`, that one broken test has failed the `verify` job — and therefore
   blocked `publish` — on **every push to `main` since `56b5d90`
   (2026-09-18T04:06:19Z)**. I checked the run history directly; every run from
   #742 through #764 (the current tip) is `failure` or `cancelled`, ~20 commits over
   roughly 4h45m: sidebar restores, retailer-link re-additions, subsection alignment
   fixes, cache-bust comment bumps. **None of it reached production.**
6. Nobody in that stretch appears to have looked at *why* — the pattern instead was
   adding meaningless redeploy-trigger comments (`// deployment trigger: editor
   hotfix v140` in `wrangler.jsonc`, `// production repair trigger 2026-09-18` in the
   repair script) and shipping more feature commits, assuming the problem was
   caching rather than a hard CI gate.

## What I did

Re-added the normalization wiring to `scripts/repair-pre-sidebar-live-state.mjs`
(imports `buildStructureContext`/`normaliseProductionLines`/`normalisePracticalLines`
from `scripts/normalise-live-card-structure.mjs`, builds a merged record per key via
the pre-existing but previously-unused `effectiveRecord()` helper, and normalizes
before writing). This is functionally the same fix that already ran successfully in
production at run 35305640550 — independently re-derived, not copy-pasted, and it
satisfies both existing tests in `test/repair-pre-sidebar-live-state.test.mjs`
without changing either test.

`npm test` (after `npm install`, since `node_modules` wasn't present): **222/222
passing**, up from 221/222 failing on `main`. Committed and pushed to
`claude/admiring-mayer-kn2t7e` (commit `c4b6bc6`). Not merged to `main`, no PR opened
(wasn't asked to).

## What I could not do from this sandbox

- No outbound network to `cigar-catalogue.psncodex.workers.dev` — this environment's
  egress proxy returns `connect_rejected` for it (organizational policy). I could
  not read live `/api/catalogue-overrides` or hit the Worker at all.
- No `CATALOGUE_ADMIN_TOKEN` — it's a GitHub Actions repository secret, not
  available here. I could not run the repair script for real even if network
  worked.
- Did not merge to `main` or open a PR — out of scope for this branch/session
  unless asked.

## What Codex (or whoever has repo-merge + Cloudflare access) needs to do

1. **Review and merge `claude/admiring-mayer-kn2t7e` into `main`.** 9-line diff in
   one file, covered by the two tests that already pin this exact behavior
   (`test/repair-pre-sidebar-live-state.test.mjs`).
2. **Watch the resulting `Publish catalogue request` run on `main`.** Because the
   diff touches `scripts/repair-pre-sidebar-live-state.mjs`, the workflow's
   `repair_changed` flag trips and it will invoke `runPreSidebarRepair()` for real
   against production again.
   - Expected outcome: since production most likely already has the correct,
     normalized values from run 35305640550, this should be close to a no-op
     (`changedKeys` near 0) — that itself is a useful confirmation that nothing
     drifted in the meantime. If it instead reports a large `changedKeys` count
     again, that means something *did* touch production in the meantime outside
     this workflow (e.g. a manual edit through the site's own editor UI) and is
     worth understanding before assuming this is "done."
   - Confirm the log line `Pre-sidebar field repair verified: N keys, M field
     writes, K rendered cards.` appears.
3. **Verify production directly**: `GET
   https://cigar-catalogue.psncodex.workers.dev/api/catalogue-overrides` and spot
   check a few of the 94 keys named in run 35305640550's summary (e.g.
   `oliva-serie-g`, `liga-t52-coronets`, `undercrown-maduro-coronets`), plus load
   the site and eyeball a couple of cards.
4. **No `catalogue-requests/*.json` files changed while CI was red** — I checked;
   nothing needs to be replayed on top of this beyond what the workflow itself does.

## The process gap worth fixing, not just the code

`main` can go red indefinitely with zero enforcement — a failing push-triggered
`verify` job doesn't block anything, it just quietly no-ops the `publish` job every
time, forever, with no alert. That's how ~20 commits of real feature work sat
un-deployed for hours without anyone noticing. Consider a branch-protection rule
requiring `verify` to pass before merge to `main`, so "CI is red" becomes impossible
to push past rather than something you have to remember to check.

Also worth naming directly: the redeploy-trigger-comment pattern
(`wrangler.jsonc` line 1, the trailing comment in the repair script) is a
tell that "my fix isn't showing up" was being treated as a caching problem. It
wasn't — it was a closed CI gate the entire time. If a fix doesn't show up in
production, check the Actions tab and the actual `verify` job output before
reaching for a cache-bust.
