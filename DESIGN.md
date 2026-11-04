# Gods of IMD design system

Source of truth: `src/styles.css` (tokens and all component classes), `src/ui/common.tsx` (shared
React pieces), `src/ui/WorldCanvas.tsx` (map art), `src/sim/genesis.ts` (faction colours, portraits).

## Overview

A dark, quiet interface around a bright pixel map. The game scene is the product: on the World route
it fills the left column on desktop and sits at the top on phones, with one cyan primary action next to
it. Pages are reading surfaces (tables, cards, feeds) on a 1120px column. Density is moderate; space,
not lines, separates groups. A serif display face gives the mythic register; everything else is the
system sans.

## Colors

Primitives (never used directly in components) and semantic roles, `src/styles.css`, `:root`:

| Role token | Value | Use |
| --- | --- | --- |
| `--color-bg` | `--ink-900` #11151d | page background, inputs |
| `--color-surface` | `--ink-850` #1a202b | cards, dialog |
| `--color-surface-raised` | `--ink-800` #232b38 | default button, notes |
| `--color-border` | `--ink-700` #34404f | dividers, table rules, button outline |
| `--color-text` | `--ink-100` #ece6d6 | body and headings |
| `--color-text-secondary` | `--ink-300` #b6b0a2 | meta, labels, captions |
| `--color-accent` | `--cyan-400` #5fe0e6 | the only interactive hue: links, primary button, focus ring, current nav item, selected inhabitant on the map |
| `--color-on-accent` | `--cyan-950` #0b1d1f | text on the primary button |
| `--color-danger` | `--coral-300` #ff9a8a | destructive button, error text |
| `--color-scene` | `--ink-950` #0d1017 | behind the canvas |

Faction colours are data, not UI roles (`FACTION_INFO` in `src/sim/genesis.ts`): Ironborn #d4664a,
Wilds #6cb460, Veil #a08ae6, Crown #e0b443. They mark faction dots, the faction card edge and map
halls, always next to the faction name. Cyan is kept away from them so "clickable" is never confused
with "faction". The design probe passed its measured solid-background text pairs on the World route at the 4.5:1 threshold (3:1 for large text). Canvas/image pairs and other routes were not exhaustively contrast-measured. `:root` declares `color-scheme: dark` so WebKit native selects use dark controls instead of a pale native fill beneath pale text; final screenshots confirm the corrected state.

## Typography

- Families: `--font-display` (Iowan Old Style, Palatino, Georgia, serif) for h1 and h2; `--font-body`
  (system-ui stack) for everything else; `--font-mono` only inside `.code` (Oracle JSON). No web fonts
  are downloaded; the serif depends on the visitor's system.
- Scale, five sizes: `--text-sm` 13px (meta, labels, tables, nav), `--text-md` 15px (body, h3),
  `--text-lg` 18px (h2, brand), `--text-xl` 24px (h1 at 420px and below, profile name), `--text-2xl`
  32px (h1).
- Weights 400, 600 (labels, buttons, h3), 700 (display headings). Headings line-height 1.15, body 1.55.
  Only h1 has tracking (-0.01em). No uppercase labels.
- Numbers in tables, meters, the status bar and key-value lists use `font-variant-numeric: tabular-nums`.
- Wrapping: headings `text-wrap: balance`, paragraphs `pretty`, lede capped at 65ch.

## Layout

- Spacing scale `--space-1..6`: 4, 8, 12, 16, 24, 32px.
- Header 52px: brand at the left edge, Sound and Help at the right edge. At 420px and below, `.top .btn` uses 8px inline padding while preserving both labels and the 40px minimum height; WebKit at 320px fits with no page overflow. Below it a single-row nav that
  scrolls horizontally inside itself when it does not fit (the page itself never scrolls sideways).
- World route (`.world`): grid `minmax(0,1fr) 380px`, filling the viewport under header and nav.
  At 900px and below it stacks: the scene keeps a 3:2 aspect (the whole map is visible at zoom 1), the
  status line moves below the scene, then the panel.
- Pages (`.page`): max 1120px, centred, 32px vertical padding (24px at 420px and below).
  `.grid2` is two equal columns, one column at 900px and below. `.cards` is an auto-fill grid with a
  240px minimum. Wide tables scroll inside `.tbl`.
- Breakpoints: 900px (stack), 420px (tighter padding, smaller h1, wrapped profile header). Marketplace shares the page/card/form primitives: the Good and Action fields form two columns above 900px and one column below; its price table scrolls inside `.tbl`. Both engines were checked at 320, 390, 900 and 1440px on ten routes. The map and Adopt action remain on the first 390px screen.

## Elevation & Depth

Flat. Surfaces step up in lightness (bg, surface, surface-raised) instead of shadows. Borders mark
structure only (nav rules, table rows, footer). The one overlay is the Help `<dialog>` with a 60% black
backdrop. On the map, building drop shadows and the night tint are drawn in canvas.

## Shapes

`--radius-sm` 6px (buttons, inputs, portraits, notes), `--radius-md` 10px (inhabitant cards),
`--radius-lg` 14px (cards, dialog). Portraits get a 1px white outline at 10% opacity. Faction cards
carry a 4px left edge in the faction colour.

## Components

- Button `.btn` (`src/styles.css`, Buttons section): 40px min height; variants `.primary` (cyan fill,
  one main action per view), default (raised surface), `.ghost` (text only), `.danger` (outlined coral),
  sizes `.big` (48px) and `.icon` (44px square). Press scales to 0.96 (off under reduced motion);
  `aria-pressed="true"` turns the outline cyan for toggles (Sound, Cooperate/Compete). Disabled is 50%
  opacity.
- Nav `.nav`: links with `aria-current="page"` get a cyan underline.
- Card `.card`: surface background, 24px padding, never nested inside another card.
- `Portrait`, `FactionTag`, `Meter` (`src/ui/common.tsx`): procedural SVG portrait as an image; colour
  dot plus faction name; native `<meter>` with label and number.
- Lists: `.mini` (name and value rows), `.feed` (chronological lines), `.tbl` (data tables), `.kv`
  (definition lists).
- Feedback: `.note` with `role="status"` for order results, `.error` with `role="alert"`, `.empty` for
  empty states that say what to do next. `.connection-status` shows joining, pending orders, recovery and service/storage errors on every route. The footer identifies local versus shared play. Local simulation never runs behind a shared connection failure.
- Forms: labels wrap their inputs; inputs have a 40px minimum height; filters grid `.filters`. Marketplace uses `.calc`, `.grid2`, `.market-summary` (tabular coin/inventory values), native quantity validation and one primary Buy/Sell action. Changing the trade fields clears the old response. A market visit offers a 60-second trading window; invalid trades return a visible response.
- Permanent records: Chronicle reads 100 entries at a time with Show older records; character history reads 40 with Show older history; Oracle judgments read 10 with Show older judgments. These display limits do not delete records. `.oracle-record` uses native `<details>/<summary>` to disclose full JSON in horizontally scrollable `.code`; summary ids wrap.
- Connection settings reuse `.card` and `.calc`; URL label, Join shared world, temporary-session warning and Use local world recovery are explicit.
- The skip link prevents hash navigation and focuses the current main landmark, retaining the active route.
- World map (`WorldCanvas`): focusable canvas; drag or arrow keys pan, plus/minus zoom (1 to 4), tap
  selects the nearest inhabitant. Animation (walking bob, weather, selection pulse, interpolation) is
  disabled under `prefers-reduced-motion`.

## Do's and Don'ts

- Do start a new page with `<div className="page">`, an h1, one `.lede`, then `.card` sections in
  `.grid2`.
- Do use `--color-accent` only for things that can be clicked or are selected.
- Do state when something is not connected; never show a number the app did not compute.
- Don't add a sixth font size, a kicker label above a heading, uppercase tracked labels or shadows on
  bordered surfaces.
- Don't put a faction colour on a control.

## Review limits and attribution

The final production export was inspected in Chromium and WebKit. Interaction checks include native disclosure, focus return, skip navigation, denied storage, trading and service errors. No physical iPhone, screen-reader session, browser-native 200% zoom, RTL translation or animation-panel slow-motion check was performed. The implementation keeps its established five-size type scale and system fonts; no font download or unrelated visual redesign was added.

Design guidance: Jakub Krehel, Better Interface (MIT), pinned commit `267330e1adfc66a718fb65fa6918c1f06d0a689e`. Documentation method: Paul Bakaus, Impeccable (Apache-2.0), pinned commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`. The licenses and attribution are retained in `artifacts/design-guidance-LICENSE.txt`. See `artifacts/validation.md` for coverage and evidence.
