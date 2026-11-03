# Gods of IMD

A browser living-world RPG built from the specification at
`https://github.com/RobertKodes/gods/blob/main/GODS_OF_IMD_.md`. 1,000 procedurally generated Genesis
inhabitants live on a canvas-rendered map: they eat, rest, gather, trade, craft, socialize, train,
duel, explore, patrol territories, research cures, raid a world boss, fall ill and die (the fallen
become memorials). You adopt up to three of them and guide them with validated orders.

The site is a static export (`dist/`) with hash routing and relative asset URLs, so it runs from an
IPFS gateway subpath. The IPFS publication under the name `gods-of-imd` is done by the IMD plane from
the committed `dist/`; nothing in this repository publishes it.

## What is live and what is not

| Area | State in this build |
| --- | --- |
| World, inhabitants, needs, skills, relationships, history | Live, simulated in the browser (`src/sim/sim.ts`) |
| Scheduled events at 09:00, 15:00, 21:00 UTC incl. Black Plague | Live; ids are unique and execute once per world (`src/sim/rules.ts`, `syncEvent`) |
| Duels, territory control, faction battles by influence, boss raids | Live, reproducible rules shown on the Arena page |
| 15-day UTC seasons, leaderboard, archive | Live; ranking ties break by level then lower token id |
| Genesis collection: 1,000 SVG portraits, metadata, manifest | Generated at build into `dist/genesis/` with computed validation |
| Persistence | `localStorage` on this device only. The world advances only while a page is open, plus up to 15 minutes of catch-up on return. There is no shared game server. |
| Oracle | Not connected. Every judgment uses a published deterministic fallback and is labelled as such. |
| NFT minting, ownership, wallet, IMD payments, prize pool, governance, swarm observatory | Not built: no contract is deployed (the brief forbids new deployments) and no IMD API or price could be verified. The Council page states this instead of showing invented figures. |

The specification also asks for a persistent 24/7 backend, PostgreSQL, contracts, a real Oracle and
swarm integrations. Those need infrastructure, keys and owner approvals outside a static export and
are not part of this delivery.

## Install, preview, rebuild

Requires Node 18+ (built with Node 24, npm 11).

```bash
npm ci              # install exact versions from package-lock.json
npm run dev         # local dev server
npm run build       # tsc --noEmit, then vite build into dist/ (also emits dist/genesis/)
npm run preview     # serve the built dist/ locally
npm test            # vitest unit tests for the simulation and collection
npm run typecheck   # tsc --noEmit
```

`vite.config.ts` sets `base: './'`. Commit `dist/` after every rebuild; the publisher serves it as is.

## Layout

- `src/sim/genesis.ts`: deterministic Genesis generator and portrait SVGs.
- `src/sim/collection.ts`: metadata, manifest and validation (used by the Vite plugin).
- `src/sim/rules.ts`: seasons, event schedule, duel rules, Oracle fallback, ranking.
- `src/sim/sim.ts`: world state, utility AI, tick, events, seasons, god decisions.
- `src/sim/store.ts`: save/load, catch-up and the 1-second tick loop.
- `src/ui/`: canvas renderer, pages, shared components, ambient sound.
- `tests/sim.test.ts`: unit tests.

## Validation results (latest run)

- `npx tsc --noEmit`: passed, no errors.
- `npx vite build`: passed; JS 218 kB (72 kB gzip), CSS 10 kB; export 2.2 MB including 2,001 Genesis files.
- `npx vitest run`: 17 of 17 tests passed (collection uniqueness and counts, manifest references,
  duel reproducibility, season and event schedule math, ranking tie-breaks, Oracle schema, simulation
  determinism, duplicate event protection, order validation, duel resolution, plague cure, memorials).
- Playwright interaction script against the built `dist/` served at a `/preview/` subpath, Chromium:
  27 of 27 checks passed (adopt, orders, rejection of invalid orders, duel challenge, filters, empty
  state, pagination, faction link filter, all routes, faction vote, Talk to the Dev form, break-even calculator, reset
  confirmation, manifest served, help dialog, persistence after reload, no horizontal scroll at 320,
  390 and 1440 on seven routes, no console errors or failed requests).
  WebKit could not launch on this machine (missing system libraries), so Safari behaviour is unchecked.
- Design probe `taste.mjs`: 16 of 16 checks passed.

Details, the design review and limitations are in `artifacts/validation.md`.
