# GitHub → KV Catalogue Publisher Design

## Goal

Enable routine Cigar Catalogue edits from ChatGPT/Codex without local commands or direct runtime access to the production admin token. GitHub becomes the handoff layer; GitHub Actions holds the secret and publishes approved request files to the existing Cloudflare Worker/KV APIs.

## Source of truth

- Git is authoritative for application code, publisher tooling, and publication request history.
- Cloudflare KV remains authoritative for the current editable catalogue state.
- Every publication must read current KV before writing and verify the resulting live state afterward.

## Architecture

1. ChatGPT/Codex creates a publication request in `catalogue-requests/` and, when needed, an accompanying image asset in `catalogue-requests/assets/`.
2. A GitHub Actions workflow triggers on changes to publication requests on `main` and also supports manual dispatch for recovery/retry.
3. The workflow supplies `CATALOGUE_ADMIN_TOKEN` from GitHub Actions Secrets only to the publisher process.
4. `scripts/publish-catalogue-request.mjs` validates the request and reads current live KV before mutation. Existing static catalogue items are updated through the complete `cards` override map so unrelated card overrides are preserved; existing/new dynamic entries are also written through `/api/catalogue-entry/<key>`. New keys become dynamic entries.
5. Rank/archive operations re-number the affected active cohort instead of introducing duplicate or gapped ranks.
6. Optional images are uploaded through the existing image endpoint, downloaded again for byte/MIME verification, and associated through the same cache-busted `/api/catalogue-image/<key>?v=...` `imageUrl` pattern used by the current admin UI.
7. The publisher verifies API/KV read-back and then verifies that production HTML contains the catalogue key. A missing rendered dynamic entry is a hard failure rather than a silent success.
8. Publication request files remain in Git as an audit trail. Secrets and generated live-state snapshots are never committed.

## Request format

Each request is a small JSON document with a stable request id and one operation. Initial supported operations:

- `upsert-entry`
- `archive-entry`
- `unarchive-entry`
- `replace-image`

For an entry upsert, the request contains:

- `operation`
- `key`
- `entry` containing only intended field updates or a complete new entry
- optional `image` object with repository-relative asset path and MIME type
- optional human-readable `note`

The publisher fetches the full current KV state before applying partial updates so omitted fields and unrelated cards are preserved. It auto-detects whether an existing key is a static card or dynamic entry.

## Image handling

Images supplied by the user are stored as repository assets for the publication request. The publisher accepts only PNG, JPEG, and WebP, enforces the Worker 12 MiB limit before upload, sends the binary to `/api/catalogue-image/<key>`, then downloads the image again and requires byte-for-byte equality plus the expected MIME type.

The current admin UI associates uploaded images by storing a cache-busted `imageUrl` such as `/api/catalogue-image/<key>?v=<timestamp>`. The publisher mirrors that existing behavior for both static card overrides and dynamic entries rather than inventing another image association mechanism.

No base64 image blobs are embedded inside JSON request files.

## Authentication and safety

- `CATALOGUE_ADMIN_TOKEN` exists only as a GitHub Actions repository secret.
- The workflow passes it to the publisher process as an environment variable.
- The publisher never prints, logs, serializes, or commits the token and redacts it if an upstream error body unexpectedly echoes it.
- No Cloudflare account credential is required for ordinary catalogue entry/image operations.
- The publisher does not wipe KV, bulk-delete entries, alter authentication, rotate credentials, or deploy Worker code as part of a normal catalogue publication.
- Individual deletion is not part of the initial publisher workflow; archive is preferred.

## GitHub Actions workflow

Create `.github/workflows/publish-catalogue.yml` with:

- pull-request runs that execute tests only;
- push-to-`main` runs for relevant publisher/request/config changes;
- optional `workflow_dispatch` with one explicit request path;
- Node setup using the repository-supported runtime;
- publisher and Worker-rendering tests before any production write;
- changed request discovery for push events;
- sequential request publication;
- immediate failure on validation, authentication, API, image, read-back, or live-render verification errors;
- no secret echoing.

Concurrency serializes catalogue publications so two simultaneous writes cannot race on rank/state assumptions.

## Dynamic-entry rendering defect

Codex reported that an entry retrievable through `/api/catalogue-entry/<key>` was not represented in production HTML. Inspection showed the Worker already contains working server-side injection (`injectEntriesIntoHtml` / `maybeInjectCatalogueHtml`), but `wrangler.jsonc` configured `assets.run_worker_first` for `/api/*` only. As a result, `/` and `/index.html` could be served directly by Workers Assets without executing the injection code.

The repair is to route `/` and `/index.html` through the Worker before static assets while preserving `/api/*`. Regression tests cover both the routing configuration and the HTML injection of a KV-only entry.

Acceptance rule: a request is not considered successfully published merely because KV contains the entry. The production response must contain the catalogue key. The routing repair requires one Worker deployment; routine catalogue publications afterward do not require deployment.

## Testing

Publisher tests use mocked HTTP and temporary files; they never mutate production.

Required coverage includes:

- request schema validation;
- stable/safe entry key handling;
- current KV read before mutation;
- partial dynamic-entry merge/preservation;
- complete static-card-map preservation;
- rank/archive cohort maintenance;
- Authorization header construction without secret leakage;
- entry/state write and read-back verification;
- image MIME/size validation;
- image upload/download verification;
- archive/unarchive behavior;
- API/auth failure handling;
- live-render verification failure when KV contains a key absent from production HTML.

Worker tests prove the restored routing configuration includes `/` and `/index.html` and that the existing injection path can render a KV-only dynamic entry.

## Operational workflow after setup

Normal user request:

> Add this cigar to my catalogue using the attached image. Research it, score it, rank it, publish it and verify it.

ChatGPT/Codex then:

1. researches the exact cigar and current Australian pricing/specifications;
2. reads current KV;
3. constructs the entry/ranking from the current catalogue and tasting rules;
4. commits a publication request and supplied image asset to GitHub;
5. GitHub Actions publishes to KV using the secret;
6. the Action verifies API state, image, and production rendering;
7. the assistant reports completion.

The user does not run PowerShell, Wrangler, KV commands, or manual image uploads for routine catalogue work.

## One-time manual setup

After implementation, the user must add one repository Actions secret:

`CATALOGUE_ADMIN_TOKEN`

Path in GitHub UI: repository Settings → Secrets and variables → Actions → New repository secret.

The routing repair also requires one deployment of the updated Worker configuration. That deployment is a one-time code deployment step and is not coupled to routine catalogue publications.

## Acceptance criteria

The feature is complete when:

- the publisher script and tests are committed;
- the GitHub Actions workflow is committed;
- static and dynamic catalogue targets are both handled without overwriting unrelated data;
- a KV-only dynamic entry is covered by a passing rendering test;
- the Worker route configuration is repaired in code;
- no production secret appears in Git history or logs;
- after the user adds `CATALOGUE_ADMIN_TOKEN` to GitHub Actions Secrets and the routing repair is deployed once, a real catalogue request can publish an entry/image and verify the live result without any local user action.
