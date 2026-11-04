# Gods of IMD

A browser living-world RPG built from the [GODS OF IMD specification](https://github.com/RobertKodes/gods/blob/main/GODS_OF_IMD_.md). Its 1,000 Genesis inhabitants gather, trade, craft, explore, fight, fall ill and become memorials. Adopt up to three and guide them with validated orders.

This revision preserves the existing game and fixes the reported collection, simulation, history, navigation, storage and responsive-layout defects. The required per-finding answers are in `.imd-responses.json`.

## Install, preview and rebuild

Requires Node 22.13+ and npm. The shared service uses Node's built-in SQLite (experimental in Node 22).

```sh
npm ci
npm run dev
npm run typecheck
npm test
npm run build
npm run preview
```

`npm run build` runs TypeScript checking, builds the client and generates all 1,000 portraits, metadata and the collection manifest. The build refuses an invalid manifest. `dist/index.html`, assets, `genesis/` and `server.json` are the complete static export and ship alongside source and `package-lock.json`. Vite uses `base: './'`; hash routes work under a gateway subpath. No backend code, database or credentials are bundled into the static client.

IPFS publication under `gods-of-imd` and GitHub publication are performed by the assignment's publication system after submission. This worker did not run a publishing command or claim a public URL.

## Local and shared play

The static export starts in **local play** when no service is configured. That world saves on this device when storage permits and catches up on return. Catch-up runs in batches without discarding elapsed time. It is separate from shared play and does not run while the browser is closed.

The repository now includes an **authoritative shared service** with durable SQLite state, exclusive adoption, session-authorized decisions and trading, permanent evidence, a background scheduler and restart recovery. To check it locally:

```sh
npm run server -- --db /tmp/gods-of-imd-local.sqlite --origins http://localhost:4173 --port 8787
# In another terminal:
npm run preview -- --host localhost --port 4173
```

Open Council, enter `http://localhost:8787` in World service URL and press Join shared world. Open another browser profile to join as another player. In shared play the browser renders service state; the service keeps running when all visitors leave. The test database in `/tmp` is not a production storage location.

For an approved public service, configure its HTTPS URL in `public/server.json` and rebuild. No URL or credentials were invented. Infrastructure, budget and provisioning remain pending the operator; public shared play is not deployed. See [backend operations and API](artifacts/backend.md) for persistence, schema, scheduling, backup, recovery, security boundaries and limitations.

## Implemented behavior

| Area | State |
| --- | --- |
| World, survival, skills, relationships, factions, duels, territories, boss raids | Playable in local or connected shared play; reproducible simulation rules |
| Events at 09:00, 15:00, 21:00 UTC and 15-day seasons | Processed in elapsed-time order; persistent event/season records |
| Chronicle, memorials, character histories and Oracle evidence | Retained without truncation; older records accessible in the UI |
| Marketplace | World prices, faction stocks and inhabitant inventories; validated buys/sales with simulation coins; travel required |
| Genesis | Exactly 1,000 unique portraits, metadata, canonical SHA-256 visual hashes and validated relative references |
| Shared persistence | Runnable service in `server/`, SQLite schema, scheduler and client connection; no infrastructure provisioned |
| Oracle | Published deterministic fallback only; full request/result evidence retained and inspectable |
| Wallet/NFT ownership, IMD payments, on-chain trading, prizes, governance, swarm | Unavailable and labelled. No new token/contract deployment; anonymous adoption does not prove NFT ownership |

No official Oracle, economic or swarm API has been connected. This revision does not claim that every integration in the broader production specification is launched.

## Collection storage

`dist/genesis/manifest.json` paths are relative to `genesis/`. Each metadata file uses `../images/<id>.svg` and `../../index.html#/inhabitant/<id>`, resolved from its own `genesis/metadata/` directory. Accessibility labels do not count toward artwork uniqueness. The generator rerolls visible collisions, and validation requires 1,000 distinct canonical visual hashes. All 1,000 portraits were additionally rasterized at 256×256 and had distinct pixel hashes.

Before marketplace publication, approve the collection and pin the artwork/export. `scripts/resolve-metadata.mjs` accepts the **actual approved artwork base URI**, a **public profile base URL**, and a separate **output directory**:

```text
node scripts/resolve-metadata.mjs --artwork-base <final-artwork-directory-URI> --profile-base <final-index.html-URL> --out <separate-metadata-directory>
```

It prepares all 1,000 records without publishing or minting and leaves `dist/` intact. Pin those metadata records separately after review. This two-step process avoids embedding a directory's own unknown CID into its contents. No final CID or public profile URL is supplied by this task, so none is guessed.

## Checks from this revision

- Production build and typecheck passed.
- `npm test`: **33/33** simulation, collection, regression, persistence and API tests passed.
- `npm run test:browser`: **133/133** interaction/layout checks passed in Chromium 156 and WebKit 27.2, plus two-context shared play. It serves the actual `dist/` at `/preview/`, launches an isolated SQLite service and shuts both down.
- Pinned `taste.mjs`: **16/16** design checks passed at 320, 390 and 1440 wide.
- A service restart/day-recovery exercise processed **86,400 ticks**, all three crossed event settlements and **54,265 Chronicle records**, then retained the result after another restart.

Browser checks are optional to install separately; they do not vendor a browser or registry into the project:

```sh
npm install --prefix /tmp/gods-browser playwright@1
/tmp/gods-browser/node_modules/.bin/playwright install chromium webkit
GODS_PLAYWRIGHT=/tmp/gods-browser/node_modules/playwright/index.mjs npm run test:browser
```

Playwright needs its normal OS dependencies. On this worker those were extracted under `/tmp` for WebKit; its launch wrapper was adjusted there to find them. No system/browser dependencies are committed. Browser scripts leave their evidence under disposable `test/scratch/browser/`. Retained screenshots, exact coverage, findings and limitations are in [validation](artifacts/validation.md). The numbers above are worker observations, not an independent audit.

## Source layout

- `src/sim/`: deterministic Genesis generation, collection validation, simulation rules, commands and browser store.
- `src/ui/`: existing canvas renderer, shared components and pages, including Marketplace and connection settings.
- `server/`: authoritative service, HTTP API, scheduler and SQLite schema.
- `tests/`: simulation, review regressions and service/API validation.
- `scripts/`: repeatable browser checks and final-storage metadata preparation.
- `DESIGN.md`: implemented tokens, typography, components and responsive behavior.
- `artifacts/`: validation evidence and backend operations.
