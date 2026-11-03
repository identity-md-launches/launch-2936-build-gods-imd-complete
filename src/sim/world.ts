import { hashStr, mulberry32 } from './rng';
import type { Faction } from './genesis';

export const MAP_W = 96;
export const MAP_H = 64;

export type LocKind =
  | 'market' | 'workshop' | 'oracle' | 'infirmary' | 'memorial' | 'home' | 'hq' | 'farm' | 'forest'
  | 'mine' | 'marsh' | 'training' | 'arena' | 'dungeon' | 'boss' | 'frontier' | 'territory';

export interface Loc { id: string; name: string; kind: LocKind; x: number; y: number; w: number; h: number; faction?: Faction; purpose: string }

export const LOCATIONS: Loc[] = [
  { id: 'market', name: 'Grand Market', kind: 'market', x: 44, y: 29, w: 8, h: 5, purpose: 'Sell gathered goods, buy food. Prices follow supply.' },
  { id: 'workshop', name: "Gods' Workshop", kind: 'workshop', x: 38, y: 24, w: 6, h: 4, purpose: 'Craft weapons and armor from ore and wood.' },
  { id: 'oracle', name: 'Oracle Temple', kind: 'oracle', x: 52, y: 24, w: 6, h: 4, purpose: 'Where event outcomes are judged and recorded.' },
  { id: 'infirmary', name: 'House of Mending', kind: 'infirmary', x: 38, y: 35, w: 5, h: 4, purpose: 'Heal wounds, treat disease, research cures.' },
  { id: 'memorial', name: 'Memorial Grounds', kind: 'memorial', x: 53, y: 35, w: 5, h: 4, purpose: 'Where the fallen are remembered. Names stay forever.' },
  { id: 'home-n', name: 'North Row homes', kind: 'home', x: 43, y: 19, w: 10, h: 3, purpose: 'Rest and eat stored food.' },
  { id: 'home-s', name: 'South Row homes', kind: 'home', x: 43, y: 40, w: 10, h: 3, purpose: 'Rest and eat stored food.' },
  { id: 'hq-Ironborn', name: 'Ironhold', kind: 'hq', x: 6, y: 5, w: 8, h: 6, faction: 'Ironborn', purpose: 'Ironborn headquarters and stockpile.' },
  { id: 'hq-Veil', name: 'Mistspire', kind: 'hq', x: 82, y: 5, w: 8, h: 6, faction: 'Veil', purpose: 'Veil headquarters and stockpile.' },
  { id: 'hq-Wilds', name: 'Greenhollow', kind: 'hq', x: 6, y: 52, w: 8, h: 6, faction: 'Wilds', purpose: 'Wilds headquarters and stockpile.' },
  { id: 'hq-Crown', name: 'Goldenreach', kind: 'hq', x: 82, y: 52, w: 8, h: 6, faction: 'Crown', purpose: 'Crown headquarters and stockpile.' },
  { id: 'farm', name: 'Sunfields', kind: 'farm', x: 40, y: 48, w: 16, h: 7, purpose: 'Gather food.' },
  { id: 'forest', name: 'Elderwood', kind: 'forest', x: 6, y: 24, w: 14, h: 14, purpose: 'Gather wood and herbs.' },
  { id: 'mine', name: 'Deepvein Mine', kind: 'mine', x: 40, y: 4, w: 14, h: 6, purpose: 'Gather ore.' },
  { id: 'marsh', name: 'Glimmer Marsh', kind: 'marsh', x: 76, y: 24, w: 14, h: 14, purpose: 'Gather herbs.' },
  { id: 'training', name: 'Training Yard', kind: 'training', x: 26, y: 28, w: 6, h: 5, purpose: 'Train combat skill.' },
  { id: 'arena', name: 'Arena of Ash', kind: 'arena', x: 64, y: 28, w: 6, h: 5, purpose: 'Duels by published rules. Spectators welcome.' },
  { id: 'dungeon', name: 'The Hollow Deep', kind: 'dungeon', x: 24, y: 6, w: 6, h: 5, purpose: 'Dangerous delve for level 3 and up. Discoveries and loot.' },
  { id: 'boss', name: 'Ashen Crag', kind: 'boss', x: 66, y: 6, w: 6, h: 5, purpose: 'Lair of the Ashen Wyrm. Raids need level 5.' },
  { id: 'frontier', name: 'Unmapped Frontier', kind: 'frontier', x: 22, y: 57, w: 14, h: 5, purpose: 'Exploration and expansion land.' },
  { id: 'frontier-e', name: 'Shattered Coast', kind: 'frontier', x: 62, y: 57, w: 14, h: 5, purpose: 'Exploration and expansion land.' },
  { id: 'terr-n', name: 'Northgate Shrine', kind: 'territory', x: 30, y: 15, w: 4, h: 4, purpose: 'Contested territory. Patrols raise influence.' },
  { id: 'terr-e', name: 'Eastwatch', kind: 'territory', x: 66, y: 16, w: 4, h: 4, purpose: 'Contested territory. Patrols raise influence.' },
  { id: 'terr-s', name: 'Southmere', kind: 'territory', x: 64, y: 44, w: 4, h: 4, purpose: 'Contested territory. Patrols raise influence.' },
  { id: 'terr-w', name: 'Westfold', kind: 'territory', x: 26, y: 42, w: 4, h: 4, purpose: 'Contested territory. Patrols raise influence.' },
];

export const LOC: Record<string, Loc> = Object.fromEntries(LOCATIONS.map((l) => [l.id, l]));
export const TERRITORIES = LOCATIONS.filter((l) => l.kind === 'territory').map((l) => l.id);

export type Tile = 0 | 1 | 2 | 3 | 4 | 5 | 6; // grass, forest, water, mountain, sand, path, field

let tileCache: Uint8Array | null = null;
export function tiles(): Uint8Array {
  if (tileCache) return tileCache;
  const t = new Uint8Array(MAP_W * MAP_H);
  const r = mulberry32(hashStr('gods-of-imd/map'));
  const noise = Array.from({ length: 40 }, () => [r() * MAP_W, r() * MAP_H, 3 + r() * 6, Math.floor(r() * 3)]);
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) {
      let v: Tile = 0;
      for (const [nx, ny, rad, k] of noise) if ((x - nx) ** 2 + (y - ny) ** 2 < rad * rad) v = (k === 0 ? 1 : k === 1 ? 0 : 1) as Tile;
      if (y < 12 && x > 34 && x < 60) v = 3;
      // river from north-east to south
      const rx = 60 + Math.sin(y / 6) * 3;
      if (Math.abs(x - rx) < 1.2 && y > 12) v = 2;
      if (y > 60) v = 4;
      t[y * MAP_W + x] = v;
    }
  const paint = (l: Loc, v: Tile) => { for (let y = l.y; y < l.y + l.h; y++) for (let x = l.x; x < l.x + l.w; x++) t[y * MAP_W + x] = v; };
  paint(LOC.forest, 1); paint(LOC.marsh, 1); paint(LOC.farm, 6); paint(LOC.mine, 3);
  // roads from town centre to every location
  const cx = 48, cy = 31;
  for (const l of LOCATIONS) {
    const lx = Math.floor(l.x + l.w / 2), ly = Math.floor(l.y + l.h / 2);
    let x = cx, y = cy;
    while (x !== lx) { t[y * MAP_W + x] = 5; x += Math.sign(lx - x); }
    while (y !== ly) { t[y * MAP_W + x] = 5; y += Math.sign(ly - y); }
  }
  tileCache = t;
  return t;
}

export function locCenter(id: string, seed: number): [number, number] {
  const l = LOC[id];
  const r = mulberry32(seed);
  return [l.x + 0.5 + r() * (l.w - 1), l.y + 0.5 + r() * (l.h - 1)];
}

export function homeOf(id: number) { return id % 2 ? 'home-n' : 'home-s'; }
