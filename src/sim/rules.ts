import { hashStr, mulberry32 } from './rng';

// ---------- Seasons: fixed 15-day windows in UTC ----------
export const SEASON_EPOCH = Date.UTC(2026, 0, 1); // Season 1 starts 2026-01-01T00:00Z
export const SEASON_MS = 15 * 24 * 3600 * 1000;
export function seasonAt(ms: number) {
  const n = Math.floor((ms - SEASON_EPOCH) / SEASON_MS) + 1;
  const start = SEASON_EPOCH + (n - 1) * SEASON_MS;
  return { n, id: `S${n}`, start, end: start + SEASON_MS };
}

// ---------- Scheduled world events: 09:00, 15:00, 21:00 UTC ----------
export const EVENT_HOURS = [9, 15, 21];
export const EVENT_KINDS = [
  'Black Plague', 'Drought', 'Harsh Winter', 'Monster Invasion', 'Ore Shortage', 'Ancient Discovery',
  'Border Dispute', 'Trade Caravan', 'Earthquake', 'Faction Challenge',
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const EVENT_INFO: Record<EventKind, { effect: string; success: string; failure: string }> = {
  'Black Plague': { effect: 'Disease spreads between inhabitants who share a place. Herbs delivered to the House of Mending advance the cure.', success: 'Cure found', failure: 'Plague burned out unchecked' },
  Drought: { effect: 'Farm yield falls to 40%. Food sells for more.', success: 'Granaries held', failure: 'Famine losses' },
  'Harsh Winter': { effect: 'Energy and food drain 50% faster. Wood sells for more.', success: 'Winter weathered', failure: 'Frostbitten season' },
  'Monster Invasion': { effect: 'Monsters gather at the frontier. Fighters who patrol there cut them down.', success: 'Invasion repelled', failure: 'Frontier overrun' },
  'Ore Shortage': { effect: 'Mine yield halves. Ore sells for double.', success: 'New vein opened', failure: 'Forges went cold' },
  'Ancient Discovery': { effect: 'Explorers find relics three times as often.', success: 'Relics recovered', failure: 'Ruins lost again' },
  'Border Dispute': { effect: 'Territory patrols count double. Rivalries sharpen.', success: 'Borders settled', failure: 'Borders still contested' },
  'Trade Caravan': { effect: 'Every good sells for 50% more at the Grand Market.', success: 'Caravan enriched the town', failure: 'Caravan left early' },
  Earthquake: { effect: 'Miners and delvers take damage. Builders who gather wood repair the town.', success: 'Town rebuilt', failure: 'Ruins remain' },
  'Faction Challenge': { effect: 'The faction that gathers the most resources wins renown.', success: 'Champion faction crowned', failure: 'No champion' },
};

export interface ScheduledEvent { id: string; kind: EventKind; start: number; end: number }

function slotTimes(dayStart: number) { return EVENT_HOURS.map((h) => dayStart + h * 3600e3); }

/** The event whose window contains `ms`, plus neighbours. Windows run until the next slot. */
export function eventsAround(ms: number, before = 3, after = 6): ScheduledEvent[] {
  const day = Math.floor(ms / 86400e3) * 86400e3;
  const slots: number[] = [];
  for (let d = -2; d <= 3; d++) slots.push(...slotTimes(day + d * 86400e3));
  const all = slots.map((s, i) => ({ id: eventId(s), kind: eventKind(s), start: s, end: slots[i + 1] ?? s + 6 * 3600e3 }));
  const cur = all.findIndex((e) => e.start <= ms && ms < e.end);
  return all.slice(Math.max(0, cur - before), cur + after + 1);
}
export function currentEvent(ms: number): ScheduledEvent {
  return eventsAround(ms, 0, 0)[0];
}
export function eventId(start: number) {
  const d = new Date(start);
  return `EV-${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}-${String(d.getUTCHours()).padStart(2, '0')}`;
}
export function eventKind(start: number): EventKind {
  const d = new Date(start);
  // Every third day the evening slot is always the Black Plague, so it recurs predictably.
  const day = Math.floor(start / 86400e3);
  if (d.getUTCHours() === 21 && day % 3 === 0) return 'Black Plague';
  return EVENT_KINDS[1 + (hashStr(eventId(start)) % (EVENT_KINDS.length - 1))];
}

// ---------- Combat: published, reproducible rules ----------
export interface Fighter { id: number; str: number; agi: number; vit: number; level: number; combat: number; weapon: number; armor: number }
export const power = (f: Fighter) => 10 + f.str * 1.2 + f.agi * 0.8 + f.vit * 0.6 + f.combat * 2 + f.level * 3 + f.weapon * 6 + f.armor * 4;
export const maxHp = (f: Fighter) => 30 + f.vit * 2 + f.level * 2;

export interface DuelRound { round: number; aHit: number; bHit: number; aHp: number; bHp: number }
export interface DuelResult { duelId: string; a: number; b: number; winner: number; loser: number; rounds: DuelRound[]; reason: string }

/** Duel rules: up to 7 rounds; each side hits for power*(0.75..1.25)/8 minus the other's armor (min 1).
 *  First to 0 HP loses. After 7 rounds the higher remaining HP share wins; an exact tie goes to the lower token id.
 *  The roll sequence is seeded only by the duel id, so anyone can replay it. */
export function duel(duelId: string, a: Fighter, b: Fighter): DuelResult {
  const r = mulberry32(hashStr(duelId));
  let aHp = maxHp(a), bHp = maxHp(b);
  const rounds: DuelRound[] = [];
  for (let i = 1; i <= 7 && aHp > 0 && bHp > 0; i++) {
    const aHit = Math.max(1, Math.round((power(a) * (0.75 + r() * 0.5)) / 8 - b.armor));
    const bHit = Math.max(1, Math.round((power(b) * (0.75 + r() * 0.5)) / 8 - a.armor));
    bHp = Math.max(0, bHp - aHit);
    aHp = Math.max(0, aHp - bHit);
    rounds.push({ round: i, aHit, bHit, aHp, bHp });
  }
  let winner: number, reason: string;
  if (aHp === 0 && bHp > 0) { winner = b.id; reason = 'knockout'; }
  else if (bHp === 0 && aHp > 0) { winner = a.id; reason = 'knockout'; }
  else {
    const as = aHp / maxHp(a), bs = bHp / maxHp(b);
    if (as === bs) { winner = Math.min(a.id, b.id); reason = 'tie broken by lower token id'; }
    else { winner = as > bs ? a.id : b.id; reason = aHp === 0 ? 'double knockout, decided on HP share' : 'decision on remaining HP share'; }
  }
  return { duelId, a: a.id, b: b.id, winner, loser: winner === a.id ? b.id : a.id, rounds, reason };
}

// ---------- Oracle adapter: bounded judgments with a deterministic fallback ----------
export interface OracleRequest {
  id: string; eventId: string; input: Record<string, number>; allowed: string[]; result: string;
  verification: 'fallback-deterministic'; source: string; at: number;
}
/** No official IMD Oracle endpoint is wired into this static build, so every judgment uses the
 *  published fallback rule and says so. The result is validated against the allowed outcomes. */
export function judge(eventId: string, kind: EventKind, input: Record<string, number>, at: number): OracleRequest {
  const info = EVENT_INFO[kind];
  const allowed = [info.success, info.failure];
  const score = input.score ?? 0;
  const result = score >= (input.threshold ?? 1) ? info.success : info.failure;
  if (!allowed.includes(result)) throw new Error('Oracle result outside schema');
  return { id: `OR-${eventId}`, eventId, input, allowed, result, verification: 'fallback-deterministic', source: 'rules.ts judge()', at };
}

// ---------- Seasons: deterministic ranking ----------
export interface Rankable { id: number; score: number; level: number }
/** Rank by score, then level, then lower token id. */
export function rank<T extends Rankable>(list: T[]): T[] {
  return [...list].sort((x, y) => y.score - x.score || y.level - x.level || x.id - y.id);
}
export function checksum(s: string) { return hashStr(s).toString(16).padStart(8, '0'); }
