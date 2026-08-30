# GitHub → KV Catalogue Publisher Design

## Goal

Enable routine Cigar Catalogue edits from ChatGPT/Codex without local commands or direct runtime access to the production admin token. GitHub becomes the handoff layer; GitHub Actions holds the secret and publishes approved request files to the existing Cloudflare Worker/KV APIs.

## Source of truth

- Git is authoritative for application code, publisher tooling, and publication request history.
- Cloudflare KV remains authoritative for the current editable catalogue state.
- Every publication must read current KV before writing and verify the resulting live state afterward.

## Architecture

1. ChatGPT/Codex creates a publication request in `catalogue-requests/` and, when needed, an accompanying image asset in `catalogue-requests/assets/`.
2. A GitHub Actions workflow triggers on changes to publication requests on `main` and may also support manual dispatch for recovery/retry.
3. The workflow supplies `CATALOGUE_ADMIN_TOKEN` from GitHub Actions Secrets only to the publisher process.
4. `scripts/publish-catalogue-request.mjs` validates the request, reads current live KV, merges a single entry safely, uploads any image through the existing image endpoint, writes the entry through the existing entry endpoint, then reads the result back.
5. The publisher verifies that the production site responds successfully and that the saved entry is represented by the production rendering path. A missing rendered dynamic entry is a hard failure rather than a silent success.
6. Publication request files remain in Git as an audit trail. Secrets and generated live-state snapshots are never committed.

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

The publisher fetches an existing entry before applying partial updates so omitted fields are preserved.

## Image handling

Images supplied by the user are stored as repository assets for the publication request. The publisher accepts only PNG, JPEG, and WebP, enforces the Worker size limit before upload, sends the binary to `/api/catalogue-image/<key>`, verifies download availability, then associates the entry using the repository's actual current image fields such as `imageSourceKey`/`imageVersion` as required by the Worker implementation.

No base64 image blobs are embedded inside JSON request files.

## Authentication and safety

- `CATALOGUE_ADMIN_TOKEN` exists only as a GitHub Actions repository secret.
- The workflow passes it to the publisher process as an environment variable.
- The publisher never prints, logs, serializes, or commits the token.
- No Cloudflare account credential is required for ordinary catalogue entry/image operations.
- The publisher does not wipe KV, bulk-delete entries, alter authentication, rotate credentials, or deploy Worker code as part of a normal catalogue publication.
- Individual deletion is not part of the initial publisher workflow; archive is preferred.

## GitHub Actions workflow

Create `.github/workflows/publish-catalogue.yml` with:

- trigger on pushes to `main` affecting `catalogue-requests/**`, publisher script/tests, and optionally manual `workflow_dispatch`;
- Node setup using the repository-supported runtime;
- install dependencies only as required by the existing project;
- run publisher tests before any production write;
- locate request files changed by the triggering commit, or accept an explicit request path on manual dispatch;
- publish requests sequentially;
- fail immediately on validation, authentication, API, image, read-back, or live-render verification errors;
- never echo secret values.

Concurrency should serialize catalogue publications so two simultaneous writes cannot race on rank/state assumptions.

## Dynamic-entry rendering defect

Codex reported that an entry retrievable through `/api/catalogue-entry/<key>` was not represented in production HTML. The current Worker already contains server-side catalogue HTML injection logic, so implementation must first reproduce and inspect that rendering path rather than invent a second rendering system.

Acceptance rule: a request is not considered successfully published merely because KV contains the entry. The production `/` or `/index.html` response must contain the dynamic entry in the expected catalogue representation. If the existing injection logic is defective, fix that Worker code and cover the defect with tests before enabling the publisher workflow.

A Worker deployment may be required once for that rendering-code fix. Routine catalogue publications afterward must not require deployment.

## Testing

Publisher tests use mocked HTTP and temporary files; they never mutate production.

Required coverage:

- request schema validation;
- stable/safe entry key handling;
- current-entry fetch before partial merge;
- preservation of unrelated fields;
- Authorization header construction without secret leakage;
- entry write/read-back verification;
- image MIME/size validation;
- image upload/download verification;
- archive/unarchive behavior;
- API/auth failure handling;
- live-render verification failure when an entry exists in API/KV but is absent from production HTML.

Worker tests must reproduce the dynamic-entry rendering issue and prove the repaired injection path renders a KV-only dynamic entry.

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

If the dynamic rendering repair requires a Worker deployment and no existing deployment automation is available, that deployment is handled as a separate one-time code deployment step; it is not coupled to routine catalogue publications.

## Acceptance criteria

The feature is complete when:

- the publisher script and tests are committed;
- the GitHub Actions workflow is committed;
- a KV-only dynamic entry is covered by a passing Worker rendering test;
- the production rendering defect is fixed in code;
- no production secret appears in Git history or logs;
- after the user adds `CATALOGUE_ADMIN_TOKEN` to GitHub Actions Secrets, a real catalogue request can publish an entry/image and verify the live result without any local user action.
