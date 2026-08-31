# Catalogue publication requests

This directory is the auditable handoff between an agent editing the repository and the live Cigar Catalogue in Cloudflare KV.

Cloudflare KV remains the source of truth for current editable catalogue data. Request files record intended mutations; `.github/workflows/publish-catalogue.yml` applies them through the existing Worker APIs and verifies the result.

## One-time repository secret

GitHub Actions requires a repository Actions secret named exactly:

`CATALOGUE_ADMIN_TOKEN`

Do not place its value in this repository, a request JSON file, logs, issues, or pull requests.

## Request file

Store requests directly under `catalogue-requests/` with a `.json` extension. Use a unique, descriptive filename such as:

`2026-08-31-davidoff-primeros-escurio.json`

Supported operations:

- `upsert-entry` — create a new dynamic entry or update an existing static/dynamic catalogue item.
- `archive-entry` — archive an existing catalogue item and close its active ranking gap.
- `unarchive-entry` — restore an archived item to its saved rank/cohort.
- `replace-image` — replace the KV-hosted image for an existing item.
- `update-sections` — update `legendHtml` and/or `benchmarksHtml` without touching catalogue entries or rankings.

Keys must match the Worker key rule: lowercase `a-z`, digits, `_` or `-`, maximum 96 characters, beginning with a letter or digit.

### Create or update

```json
{
  "id": "2026-08-31-davidoff-primeros-escurio",
  "operation": "upsert-entry",
  "key": "davidoff-primeros-escurio",
  "entry": {
    "brand": "Davidoff",
    "title": "Primeros Escurio — Tin of 6",
    "rank": 3,
    "strength": 8,
    "quality": 9,
    "risk": 2,
    "packagePrice": 132,
    "packageLabel": "tin of 6",
    "price": 22,
    "country": "Dominican Republic",
    "length": 4.125,
    "ring": 34,
    "size": "gold",
    "retailerLinks": ["https://example.com/product"],
    "smokeTime": "25–35 min smoke",
    "experienceTags": ["Nicotine: High"],
    "eyebrow": "Premium compact Escurio benchmark",
    "summaryHtml": "<strong>Example only.</strong>",
    "productionLines": ["Handmade"],
    "practicalLines": ["Tin of 6"]
  },
  "note": "Example schema only; do not publish this example."
}
```

For an existing item, `entry` may contain only the fields intended to change. The publisher reads current KV first and preserves unrelated fields. Existing static cards are updated through the complete `cards` map; existing/new dynamic entries are also written through `/api/catalogue-entry/<key>`.

If rank, taster/main cohort, or archive state changes, the publisher re-numbers the affected active cohort so duplicate/gapped ranks are not introduced.

## Image requests

Images are repository assets under `catalogue-requests/assets/`. Only PNG, JPEG, and WebP are accepted and the Worker maximum is 12 MiB.

```json
{
  "id": "2026-08-31-replace-example-image",
  "operation": "replace-image",
  "key": "example-key",
  "image": {
    "path": "catalogue-requests/assets/example.webp",
    "mimeType": "image/webp"
  }
}
```

An `upsert-entry` request may also include the same `image` object. The publisher uploads the exact bytes to `/api/catalogue-image/<key>`, downloads them again to verify byte-for-byte equality and MIME type, then stores the same cache-busted `/api/catalogue-image/<key>?v=...` URL used by the existing admin UI.

## Verification

A publication is successful only if all applicable checks pass:

1. current KV state read succeeds;
2. image upload/download verification succeeds when present;
3. authenticated entry/state writes succeed;
4. entry/state read-back matches intended fields;
5. production HTML returns successfully and contains the catalogue key.

If a new dynamic entry exists in KV but is absent from production HTML, the workflow fails rather than reporting success.

## Manual retry

The workflow supports `workflow_dispatch` with a repository-relative `request_path`. This re-runs one existing request file after the test suite passes.
