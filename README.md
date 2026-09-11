# Cigar Catalogue

Cloudflare Workers catalogue with KV-backed editable state, retailer stock checks, ranking cohorts, browser editing tools and GitHub-driven publication requests.

## Sources of truth

- **Cloudflare KV** is authoritative for current editable catalogue data.
- **Git** is authoritative for application code, tests, tooling and catalogue publication history.
- `catalogue-requests/` is intentionally retained as an audit trail. Do not treat old request files as the current catalogue state.
- Read `/api/catalogue-overrides` before making decisions based on current catalogue data.

## Runtime structure

- `src/index.js` — Worker/API, KV state handling, dynamic entry rendering and HTML transformation.
- `src/stock.js` — retailer stock discovery/checking and cache logic.
- `public/index.html` — static catalogue baseline.
- `public/catalogue-runtime.mjs` — browser-only feature bootstrap.
- `public/catalogue-save-pipeline.mjs` — shared catalogue-state save interception for browser editor features.
- `public/catalogue-value.mjs` — browser-independent Value calculation shared by the Worker and frontend modules.
- `scripts/publish-catalogue-request.mjs` — request application and verification logic.
- `scripts/publish-live-catalogue-request.mjs` — authenticated live publisher used by GitHub Actions.

## Development

```bash
npm test
npm run dev
```

`npm test` runs the full Node regression suite, including Worker rendering, publisher behavior, ranking cohorts, editor behavior, Value/Flavour logic, stock visibility and convenience UI contracts.

## Catalogue changes

Routine catalogue data changes should be represented by a JSON request under `catalogue-requests/` and pushed through the repository workflow. The workflow reads current live state, applies requests sequentially, verifies KV/API read-back and verifies production rendering.

Do not hard-code derived Value scores or overwrite unrelated fields in targeted edits. Main, Half-Cigar and Taster rankings are independent contiguous cohorts.

## Deployment

For a manual Worker/code deployment:

```bash
npm run deploy
```

On Windows, `DEPLOY.bat` runs the same Wrangler deployment command.

Frontend, Worker, test and publisher changes are covered by the GitHub verification workflow. Changes to `public/**` run tests but do not publish catalogue request data unless a request JSON also changed.
