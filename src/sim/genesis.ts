import { hashStr, mulberry32, pick } from './rng';

export const FACTIONS = ['Ironborn', 'Wilds', 'Veil', 'Crown'] as const;
export type Faction = (typeof FACTIONS)[number];

export const FACTION_INFO: Record<Faction, { color: string; focus: string; roles: string[]; motto: string }> = {
  Ironborn: { color: '#d4664a', focus: 'Combat, defense and strength', roles: ['Warrior', 'Guardian', 'Smith'], motto: 'Hold the line.' },
  Wilds: { color: '#6cb460', focus: 'Nature, food, medicine and exploration', roles: ['Ranger', 'Herbalist', 'Farmer'], motto: 'Root and grow.' },
  Veil: { color: '#a08ae6', focus: 'Intelligence, scouting and secrets', roles: ['Scout', 'Scholar', 'Whisper'], motto: 'See first.' },
  Crown: { color: '#e0b443', focus: 'Trade, resources, development and diplomacy', roles: ['Merchant', 'Builder', 'Envoy'], motto: 'Build to last.' },
};

export const RARITIES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'] as const;
export type Rarity = (typeof RARITIES)[number];
export const RARITY_COUNTS: Record<Rarity, number> = { Common: 500, Uncommon: 300, Rare: 150, Epic: 40, Legendary: 10 };

export const TRAITS = ['bravery', 'curiosity', 'sociability', 'diligence', 'greed', 'loyalty'] as const;
export type Trait = (typeof TRAITS)[number];
export const ATTRS = ['str', 'agi', 'int', 'cha', 'vit'] as const;
export type Attr = (typeof ATTRS)[number];

export interface Genesis {
  id: number;
  name: string;
  faction: Faction;
  role: string;
  rarity: Rarity;
  traits: Record<Trait, number>;
  attrs: Record<Attr, number>;
  look: { skin: number; hair: number; hairColor: number; eyes: number; mark: number; bg: number };
  dna: string;
}

export const COLLECTION_SIZE = 1000;
const SEED = 'gods-of-imd/genesis/v1';

const PRE = ['Ar', 'Bel', 'Cor', 'Dra', 'El', 'Fen', 'Gal', 'Hal', 'Isk', 'Jor', 'Kal', 'Lor', 'Mor', 'Nym', 'Os', 'Pyr', 'Quel', 'Ras', 'Syl', 'Tor', 'Ul', 'Vey', 'Wren', 'Yar', 'Zel', 'Ash', 'Bryn', 'Cael', 'Dun', 'Eir'];
const MID = ['a', 'e', 'i', 'o', 'u', 'ae', 'ia', 'or', 'en', 'is', 'an', 'yr'];
const SUF = ['dor', 'wyn', 'mir', 'ric', 'th', 'nel', 'ros', 'vin', 'gar', 'los', 'ra', 'dra', 'lis', 'mon', 'sha', 'ven', 'rik', 'nor'];
const EPITHET: Record<Faction, string[]> = {
  Ironborn: ['the Anvil', 'Stonefist', 'of the Forge', 'Ironhand', 'the Unbroken', 'Shieldborn'],
  Wilds: ['Mossheart', 'of the Glade', 'Thornstep', 'Rootcaller', 'the Green', 'Fernsong'],
  Veil: ['the Quiet', 'Nightglass', 'of the Mist', 'Shadeborn', 'the Unseen', 'Inkwell'],
  Crown: ['the Gilded', 'Coinbright', 'of the Market', 'Highseal', 'the Steward', 'Goldleaf'],
};

function shuffle<T>(arr: T[], r: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

let cache: Genesis[] | null = null;

export function genesisCollection(): Genesis[] {
  if (cache) return cache;
  const r = mulberry32(hashStr(SEED));
  const factions = shuffle(Array.from({ length: COLLECTION_SIZE }, (_, i) => FACTIONS[i % 4]), r);
  const rarities = shuffle(RARITIES.flatMap((k) => Array.from({ length: RARITY_COUNTS[k] }, () => k)), r);
  const names = new Set<string>();
  const dnas = new Set<string>();
  const visuals = new Set<string>();
  const out: Genesis[] = [];
  for (let i = 0; i < COLLECTION_SIZE; i++) {
    const id = i + 1;
    const faction = factions[i];
    const rarity = rarities[i];
    const tr = mulberry32(hashStr(`${SEED}/${id}`));
    let name = '';
    do {
      const base = pick(tr, PRE) + pick(tr, MID) + pick(tr, SUF);
      name = `${base} ${pick(tr, EPITHET[faction])}`;
    } while (names.has(name));
    names.add(name);
    const role = pick(tr, FACTION_INFO[faction].roles);
    const traits = Object.fromEntries(TRAITS.map((t) => [t, Math.round(tr() * 100) / 100])) as Record<Trait, number>;
    if (faction === 'Ironborn') traits.bravery = Math.min(1, traits.bravery + 0.25);
    if (faction === 'Wilds') traits.curiosity = Math.min(1, traits.curiosity + 0.2);
    if (faction === 'Veil') traits.curiosity = Math.min(1, traits.curiosity + 0.25);
    if (faction === 'Crown') traits.greed = Math.min(1, traits.greed + 0.25);
    const bonus = RARITIES.indexOf(rarity);
    const attrs = Object.fromEntries(ATTRS.map((a) => [a, 4 + Math.floor(tr() * 9) + bonus])) as Record<Attr, number>;
    const lean: Record<Faction, Attr> = { Ironborn: 'str', Wilds: 'vit', Veil: 'int', Crown: 'cha' };
    attrs[lean[faction]] += 3;
    let look: Genesis['look'];
    let dna: string;
    do {
      look = {
        skin: Math.floor(tr() * 6), hair: Math.floor(tr() * 7), hairColor: Math.floor(tr() * 8),
        eyes: Math.floor(tr() * 4), mark: Math.floor(tr() * 6), bg: Math.floor(tr() * 5),
      };
      dna = `${faction[0]}${RARITIES.indexOf(rarity)}${FACTION_INFO[faction].roles.indexOf(role)}-${look.skin}${look.hair}${look.hairColor}${look.eyes}${look.mark}${look.bg}-${ATTRS.map((a) => attrs[a].toString(16)).join('')}`;
    } while (dnas.has(dna) || visuals.has(visualPortrait(portraitSvg({ id, name, faction, role, rarity, traits, attrs, look, dna }))));
    dnas.add(dna);
    visuals.add(visualPortrait(portraitSvg({ id, name, faction, role, rarity, traits, attrs, look, dna })));
    out.push({ id, name, faction, role, rarity, traits, attrs, look, dna });
  }
  cache = out;
  return out;
}

const SKIN = ['#f1d0b0', '#e0b18c', '#c68e64', '#a26d45', '#7a4f31', '#59392a'];
const HAIR = ['#1f1a17', '#4b3021', '#8a5a2b', '#c9a15a', '#e6e1d6', '#9b3b2a', '#3b4b6b', '#5b3b6e'];
const BG: Record<Faction, string[]> = {
  Ironborn: ['#3a1f1a', '#4a2620', '#2e1915', '#52302a', '#3f2a22'],
  Wilds: ['#1d3420', '#24402a', '#18301c', '#2c4a2f', '#203a2a'],
  Veil: ['#241f3d', '#2d2650', '#1c1833', '#352c5c', '#262040'],
  Crown: ['#3a3018', '#4a3c1d', '#30270f', '#524421', '#3c3216'],
};
const FRAME: Record<Rarity, string> = { Common: '#6b7280', Uncommon: '#9ca3af', Rare: '#60a5fa', Epic: '#c084fc', Legendary: '#fbbf24' };

/** Original procedural portrait for one Genesis inhabitant, as a standalone SVG document. */
export function portraitSvg(g: Genesis): string {
  const f = FACTION_INFO[g.faction];
  const skin = SKIN[g.look.skin];
  const hair = HAIR[g.look.hairColor];
  const bg = BG[g.faction][g.look.bg];
  const hairShapes = [
    `<path d="M20 26c0-9 6-14 12-14s12 5 12 14c-3-5-7-7-12-7s-9 2-12 7z" fill="${hair}"/>`,
    `<path d="M19 30c-1-11 5-18 13-18s14 7 13 18l-3-8c-3 2-17 2-20 0z" fill="${hair}"/>`,
    `<path d="M21 24c2-8 7-11 11-11s9 3 11 11c-4-3-18-3-22 0z" fill="${hair}"/><path d="M20 26l-3 14 5-4z" fill="${hair}"/><path d="M44 26l3 14-5-4z" fill="${hair}"/>`,
    `<circle cx="32" cy="16" r="5" fill="${hair}"/><path d="M21 25c1-7 6-10 11-10s10 3 11 10c-5-3-17-3-22 0z" fill="${hair}"/>`,
    `<path d="M20 27c0-10 5-15 12-15s12 5 12 15l-2 12-3-14c-4 1-10 1-14 0l-3 14z" fill="${hair}"/>`,
    `<path d="M22 22c3-6 7-8 10-8s7 2 10 8z" fill="${hair}"/>`,
    '',
  ];
  const marks = [
    '',
    `<path d="M25 30l3 6" stroke="#7a2e22" stroke-width="1.2"/>`,
    `<circle cx="38" cy="34" r="1.2" fill="#3a2a22"/>`,
    `<path d="M24 34h4M36 34h4" stroke="${f.color}" stroke-width="1.4" opacity=".8"/>`,
    `<path d="M32 17l2 3-2 3-2-3z" fill="${f.color}"/>`,
    `<path d="M27 40q5 3 10 0" stroke="#3a2a22" stroke-width="1" fill="none"/>`,
  ];
  const eyes = [
    `<circle cx="28" cy="30" r="1.6" fill="#1b1b1b"/><circle cx="36" cy="30" r="1.6" fill="#1b1b1b"/>`,
    `<path d="M26 30h4M34 30h4" stroke="#1b1b1b" stroke-width="1.6" stroke-linecap="round"/>`,
    `<circle cx="28" cy="30" r="1.8" fill="${f.color}"/><circle cx="36" cy="30" r="1.8" fill="${f.color}"/>`,
    `<circle cx="28" cy="30" r="1.4" fill="#e8f1ff"/><circle cx="36" cy="30" r="1.4" fill="#e8f1ff"/>`,
  ];
  const crest: Record<Faction, string> = {
    Ironborn: `<path d="M20 22h24l-2-7H22z" fill="#8b8f98"/><path d="M31 9h2v7h-2z" fill="${f.color}"/>`,
    Wilds: `<path d="M20 20q4-6 6 0q3-7 6 0q3-7 6 0q2-6 6 0" stroke="${f.color}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
    Veil: `<path d="M17 40c0-20 6-30 15-30s15 10 15 30l-4-2c0-12-4-20-11-20s-11 8-11 20z" fill="${f.color}" opacity=".85"/>`,
    Crown: `<path d="M22 19l2-7 4 4 4-6 4 6 4-4 2 7z" fill="${f.color}"/>`,
  };
  const legendary = g.rarity === 'Legendary' ? `<circle cx="32" cy="30" r="22" fill="none" stroke="${FRAME.Legendary}" stroke-width=".8" opacity=".6"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="256" height="256" role="img" aria-label="${g.name}"><rect width="64" height="64" fill="${bg}"/>${legendary}<path d="M12 64c2-12 10-17 20-17s18 5 20 17z" fill="${f.color}"/><path d="M26 47h12l-6 7z" fill="${bg}" opacity=".5"/><rect x="28" y="38" width="8" height="9" fill="${skin}"/><ellipse cx="32" cy="30" rx="11" ry="12" fill="${skin}"/>${hairShapes[g.look.hair]}${eyes[g.look.eyes]}${marks[g.look.mark]}${crest[g.faction]}<rect x="1" y="1" width="62" height="62" fill="none" stroke="${FRAME[g.rarity]}" stroke-width="2"/></svg>`;
}

export function metadataFor(g: Genesis) {
  return {
    name: `${g.name} #${g.id}`,
    description: `Genesis inhabitant #${g.id} of Gods of IMD: a ${g.rarity.toLowerCase()} ${g.role.toLowerCase()} of the ${g.faction}.`,
    image: `../images/${g.id}.svg`,
    external_url: `../../index.html#/inhabitant/${g.id}`,
    attributes: [
      { trait_type: 'Faction', value: g.faction },
      { trait_type: 'Role', value: g.role },
      { trait_type: 'Rarity', value: g.rarity },
      ...ATTRS.map((a) => ({ trait_type: a.toUpperCase(), value: g.attrs[a], display_type: 'number' })),
      ...TRAITS.map((t) => ({ trait_type: t[0].toUpperCase() + t.slice(1), value: Math.round(g.traits[t] * 100), max_value: 100 })),
      { trait_type: 'DNA', value: g.dna },
    ],
  };
}

/** Accessibility text describes a portrait; it must not count as visible uniqueness. */
export function visualPortrait(svg: string) {
  return svg.replace(/\saria-label="[^"]*"/g, '').replace(/<(title|desc)\b[^>]*>[\s\S]*?<\/\1>/g, '');
}
