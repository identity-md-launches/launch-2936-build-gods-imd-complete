import { FACTIONS, genesisCollection, type Faction, type Genesis } from './genesis';
import { LOC, TERRITORIES, homeOf, locCenter } from './world';
import { hashStr, mulberry32, clamp } from './rng';
import { checksum, currentEvent, duel, EVENT_INFO, judge, rank, seasonAt, type DuelResult, type EventKind, type OracleRequest, type Fighter } from './rules';

export const SKILLS = ['combat', 'gathering', 'crafting', 'trade', 'scouting', 'medicine'] as const;
export type Skill = (typeof SKILLS)[number];
export const ACTIONS = ['eat', 'rest', 'heal', 'gather', 'trade', 'craft', 'socialize', 'train', 'duel', 'explore', 'patrol', 'research', 'raid'] as const;
export type Action = (typeof ACTIONS)[number];
export type Res = 'food' | 'wood' | 'ore' | 'herbs';

export interface Agent {
  id: number; x: number; y: number; px: number; py: number; tx: number; ty: number;
  act: Action; loc: string; timer: number; arrived: boolean;
  food: number; energy: number; health: number; mood: number;
  xp: number; level: number; skills: Record<Skill, number>;
  inv: Record<Res, number>; coins: number; weapon: number; armor: number;
  rel: Record<string, number>; history: string[]; achievements: string[];
  infected: boolean; alive: boolean; died?: { tick: number; cause: string; at: number };
  wins: number; losses: number; score: number; discoveries: number; priority: Action | null;
  task: Task | null;
}
export interface Task { kind: 'goto' | 'duel'; loc: string; target?: number; decisionId: string }
export interface ChronicleEntry { at: number; kind: string; text: string; ref?: string }
export interface Decision { id: string; at: number; agent: number; text: string; status: 'rejected' | 'accepted' | 'done' | 'failed'; reason: string; cost: string }
export interface EventState { id: string; kind: EventKind; start: number; end: number; progress: number; target: number; stance: Record<Faction, 'cooperate' | 'compete'>; tally: Record<Faction, number>; settled: boolean; oracle?: OracleRequest }
export interface SeasonRecord { id: string; start: number; end: number; top: { id: number; score: number; level: number }[]; factions: Record<Faction, number>; checksum: string; prize: string }

export interface World {
  version: 1; tick: number; lastReal: number; agents: Agent[];
  stock: Record<Faction, Record<Res, number>>; renown: Record<Faction, number>;
  prices: Record<Res, number>; influence: Record<string, Record<Faction, number>>; control: Record<string, Faction | null>;
  boss: { hp: number; max: number; defeats: number };
  monsters: number; duels: DuelResult[]; chronicle: ChronicleEntry[]; decisions: Decision[];
  event: EventState | null; executed: string[]; season: string; seasonStart: number; archive: SeasonRecord[];
  adopted: number[]; cureResearch: number;
}

export const TICK_MS = 1000;
export const GAME_DAY_TICKS = 1200; // one in-game day lasts 20 real minutes
const BASE_PRICE: Record<Res, number> = { food: 3, wood: 2, ore: 4, herbs: 5 };

const zeroF = <T,>(v: () => T) => Object.fromEntries(FACTIONS.map((f) => [f, v()])) as Record<Faction, T>;
export const G = () => genesisCollection();

export function fighter(a: Agent): Fighter {
  const g = G()[a.id - 1];
  return { id: a.id, str: g.attrs.str, agi: g.attrs.agi, vit: g.attrs.vit, level: a.level, combat: Math.floor(a.skills.combat), weapon: a.weapon, armor: a.armor };
}

export function newWorld(now: number): World {
  const agents: Agent[] = G().map((g) => {
    const home = g.faction === 'Crown' || g.faction === 'Veil' ? `hq-${g.faction}` : `hq-${g.faction}`;
    const [x, y] = locCenter(home, g.id * 7);
    return {
      id: g.id, x, y, px: x, py: y, tx: x, ty: y, act: 'rest', loc: home, timer: 0, arrived: true,
      food: 70 + (g.id % 30), energy: 60 + (g.id % 40), health: 100, mood: 70,
      xp: 0, level: 1, skills: { combat: g.attrs.str / 4, gathering: g.attrs.vit / 4, crafting: g.attrs.int / 5, trade: g.attrs.cha / 4, scouting: g.attrs.agi / 4, medicine: g.attrs.int / 4 },
      inv: { food: 3, wood: 0, ore: 0, herbs: 0 }, coins: 10 + g.attrs.cha, weapon: g.rarity === 'Legendary' ? 2 : 0, armor: g.rarity === 'Epic' || g.rarity === 'Legendary' ? 1 : 0,
      rel: {}, history: [], achievements: [], infected: false, alive: true, wins: 0, losses: 0, score: 0, discoveries: 0, priority: null, task: null,
    };
  });
  const s = seasonAt(now);
  const w: World = {
    version: 1, tick: 0, lastReal: now, agents,
    stock: zeroF(() => ({ food: 40, wood: 20, ore: 10, herbs: 10 })), renown: zeroF(() => 0),
    prices: { ...BASE_PRICE }, influence: Object.fromEntries(TERRITORIES.map((t) => [t, zeroF(() => 0)])), control: Object.fromEntries(TERRITORIES.map((t) => [t, null])),
    boss: { hp: 4000, max: 4000, defeats: 0 }, monsters: 0, duels: [], chronicle: [], decisions: [], event: null, executed: [],
    season: s.id, seasonStart: s.start, archive: [], adopted: [], cureResearch: 0,
  };
  chron(w, now, 'world', 'The Gods shaped the land. One thousand Genesis inhabitants woke in their four halls.');
  return w;
}

export function chron(w: World, at: number, kind: string, text: string, ref?: string) {
  w.chronicle.unshift({ at, kind, text, ref });
  if (w.chronicle.length > 400) w.chronicle.length = 400;
}
function hist(a: Agent, text: string) {
  a.history.unshift(text);
  if (a.history.length > 14) a.history.length = 14;
}
function achieve(w: World, a: Agent, name: string, at: number) {
  if (a.achievements.includes(name)) return;
  a.achievements.push(name);
  a.score += 25;
  chron(w, at, 'achievement', `${G()[a.id - 1].name} earned "${name}".`, `#/inhabitant/${a.id}`);
}
export function gainXp(w: World, a: Agent, n: number, at: number) {
  a.xp += n; a.score += n;
  const need = a.level * a.level * 40;
  if (a.xp >= need) {
    a.level++;
    hist(a, `Reached level ${a.level}.`);
    if (a.level === 5) achieve(w, a, 'Seasoned', at);
    if (a.level === 10) achieve(w, a, 'Legend of the Realm', at);
  }
}

// ---------- Utility AI ----------
const GATHER: Record<Faction, [string, Res][]> = {
  Ironborn: [['mine', 'ore'], ['forest', 'wood']],
  Wilds: [['farm', 'food'], ['forest', 'herbs'], ['marsh', 'herbs']],
  Veil: [['marsh', 'herbs'], ['mine', 'ore']],
  Crown: [['farm', 'food'], ['forest', 'wood'], ['mine', 'ore']],
};
function gatherSpot(a: Agent, g: Genesis, r: () => number): [string, Res] {
  const opts = GATHER[g.faction];
  if (a.food < 35 && a.inv.food < 2) return ['farm', 'food'];
  return opts[Math.floor(r() * opts.length)];
}

function choose(w: World, a: Agent, g: Genesis, r: () => number): [Action, string] {
  const t = g.traits;
  const ev = w.event?.kind;
  const invTotal = a.inv.food + a.inv.wood + a.inv.ore + a.inv.herbs;
  const s: Partial<Record<Action, number>> = {
    eat: ((100 - a.food) / 100) * 1.6 + (a.food < 25 ? 1 : 0),
    rest: ((100 - a.energy) / 100) * 1.4 + (a.energy < 20 ? 1 : 0),
    heal: ((100 - a.health) / 100) * 1.7 + (a.infected ? 0.9 : 0),
    gather: 0.35 + t.diligence * 0.6,
    trade: invTotal > 8 ? 0.5 + t.greed * 0.6 : 0,
    craft: a.inv.ore >= 3 && a.inv.wood >= 2 && a.weapon + a.armor < 10 ? 0.8 : 0,
    socialize: ((100 - a.mood) / 100) * (0.4 + t.sociability),
    train: t.bravery * 0.45 + (g.faction === 'Ironborn' ? 0.15 : 0),
    duel: a.health > 75 && a.level >= 2 ? t.bravery * 0.35 : 0,
    explore: t.curiosity * 0.45 + (ev === 'Ancient Discovery' ? 0.4 : 0),
    patrol: t.loyalty * 0.35 + (ev === 'Border Dispute' ? 0.4 : 0) + (ev === 'Monster Invasion' ? t.bravery * 0.6 : 0),
    research: ev === 'Black Plague' && (a.inv.herbs > 0 || a.skills.medicine > 3) ? 0.5 + a.skills.medicine * 0.05 : 0,
    raid: a.level >= 5 && a.health > 80 ? t.bravery * 0.4 : 0,
  };
  if (a.priority && s[a.priority] !== undefined) s[a.priority] = (s[a.priority] ?? 0) + 0.9;
  let best: Action = 'rest', bv = -1;
  for (const k of ACTIONS) {
    const v = (s[k] ?? 0) + r() * 0.25;
    if (v > bv) { bv = v; best = k; }
  }
  const loc = locFor(w, a, g, best, r);
  return [best, loc];
}

function locFor(w: World, a: Agent, g: Genesis, act: Action, r: () => number): string {
  switch (act) {
    case 'eat': return a.inv.food > 0 ? homeOf(a.id) : 'market';
    case 'rest': return r() < 0.5 ? homeOf(a.id) : `hq-${g.faction}`;
    case 'heal': case 'research': return 'infirmary';
    case 'gather': return gatherSpot(a, g, r)[0];
    case 'trade': return 'market';
    case 'craft': return 'workshop';
    case 'socialize': return r() < 0.5 ? 'market' : `hq-${g.faction}`;
    case 'train': return 'training';
    case 'duel': return 'arena';
    case 'explore': return a.level >= 3 && r() < 0.4 ? 'dungeon' : r() < 0.5 ? 'frontier' : 'frontier-e';
    case 'patrol': return w.event?.kind === 'Monster Invasion' && r() < 0.6 ? 'frontier' : TERRITORIES[Math.floor(r() * 4)];
    case 'raid': return 'boss';
  }
}

const RES_OF: Record<string, Res> = { farm: 'food', forest: 'wood', mine: 'ore', marsh: 'herbs' };

function eventMod(w: World) {
  const k = w.event?.kind;
  return {
    farm: k === 'Drought' ? 0.4 : 1,
    mine: k === 'Ore Shortage' ? 0.5 : 1,
    drain: k === 'Harsh Winter' ? 1.5 : 1,
    sell: k === 'Trade Caravan' ? 1.5 : 1,
    relic: k === 'Ancient Discovery' ? 3 : 1,
    patrol: k === 'Border Dispute' ? 2 : 1,
  };
}

// ---------- Tick ----------
export function tick(w: World, at: number) {
  w.tick++;
  const T = w.tick;
  const m = eventMod(w);
  const gen = G();
  const byLoc = new Map<string, Agent[]>();
  for (const a of w.agents) if (a.alive && a.arrived) { const l = byLoc.get(a.loc); if (l) l.push(a); else byLoc.set(a.loc, [a]); }

  for (const a of w.agents) {
    if (!a.alive) continue;
    const g = gen[a.id - 1];
    const r = mulberry32(hashStr(`t${T}a${a.id}`));
    a.px = a.x; a.py = a.y;
    // needs
    a.food = clamp(a.food - 0.09 * m.drain, 0, 100);
    a.energy = clamp(a.energy - (a.arrived && a.act === 'rest' ? 0 : 0.07 * m.drain), 0, 100);
    a.mood = clamp(a.mood - 0.04, 0, 100);
    if (a.food <= 0) a.health -= 0.4;
    if (a.infected) a.health -= 0.12;
    if (a.food > 50 && a.energy > 30 && !a.infected) a.health = Math.min(100, a.health + 0.05);
    if (a.health <= 0) { die(w, a, a.infected ? 'the Black Plague' : 'starvation', at); continue; }

    // movement
    if (!a.arrived) {
      const dx = a.tx - a.x, dy = a.ty - a.y, d = Math.hypot(dx, dy);
      const sp = 0.9 + g.attrs.agi * 0.03;
      if (d <= sp) { a.x = a.tx; a.y = a.ty; a.arrived = true; }
      else { a.x += (dx / d) * sp; a.y += (dy / d) * sp; }
      continue;
    }
    if (a.timer > 0) { a.timer--; perform(w, a, g, r, byLoc, at, m); continue; }

    // finish tasks given by a God
    if (a.task) {
      const d = w.decisions.find((x) => x.id === a.task!.decisionId);
      if (a.loc === a.task.loc) {
        if (a.task.kind === 'duel' && a.task.target) {
          const b = w.agents[a.task.target - 1];
          if (b.alive) runDuel(w, a, b, at); else if (d) { d.status = 'failed'; d.reason = 'The opponent fell before the duel.'; }
        }
        if (d && d.status === 'accepted') d.status = 'done';
        a.task = null;
      } else { send(a, a.task.loc, T); continue; }
    }
    const [act, loc] = choose(w, a, g, r);
    a.act = act;
    a.timer = 6 + Math.floor(r() * 10);
    if (loc !== a.loc) send(a, loc, T); 
  }

  // event pressure
  if (w.event && !w.event.settled) eventTick(w, byLoc);
  // territory control and price drift every 30 ticks
  if (T % 30 === 0) {
    for (const t of TERRITORIES) {
      const inf = w.influence[t];
      let best: Faction | null = null, bv = 20;
      for (const f of FACTIONS) { inf[f] *= 0.97; if (inf[f] > bv) { bv = inf[f]; best = f; } }
      if (best !== w.control[t]) {
        if (best) chron(w, at, 'territory', `${best} took control of ${LOC[t].name}.`);
        w.control[t] = best;
      }
    }
    for (const k of Object.keys(w.prices) as Res[]) w.prices[k] = +(w.prices[k] + (BASE_PRICE[k] - w.prices[k]) * 0.1).toFixed(2);
  }
}

function send(a: Agent, loc: string, T: number) {
  const [x, y] = locCenter(loc, hashStr(`${a.id}/${loc}/${T % 7}`));
  a.loc = loc; a.tx = x; a.ty = y; a.arrived = false;
}

function die(w: World, a: Agent, cause: string, at: number) {
  a.alive = false; a.health = 0; a.act = 'rest';
  a.died = { tick: w.tick, cause, at };
  const [x, y] = locCenter('memorial', a.id);
  a.x = a.px = a.tx = x; a.y = a.py = a.ty = y; a.loc = 'memorial';
  const g = G()[a.id - 1];
  hist(a, `Fell to ${cause}. Remembered at the Memorial Grounds.`);
  chron(w, at, 'death', `${g.name} of the ${g.faction} fell to ${cause}. Their name is carved at the Memorial Grounds.`, `#/inhabitant/${a.id}`);
}

function perform(w: World, a: Agent, g: Genesis, r: () => number, byLoc: Map<string, Agent[]>, at: number, m: ReturnType<typeof eventMod>) {
  const here = byLoc.get(a.loc) ?? [];
  switch (a.act) {
    case 'eat':
      if (a.inv.food > 0 && a.food < 90) { a.inv.food--; a.food = Math.min(100, a.food + 30); }
      else if (a.loc === 'market' && a.coins >= w.prices.food && a.food < 90) { a.coins -= w.prices.food; a.food = Math.min(100, a.food + 30); w.prices.food += 0.01; }
      else if (a.food < 40) { const st = w.stock[g.faction]; if (st.food > 0) { st.food--; a.food += 25; } }
      break;
    case 'rest': a.energy = Math.min(100, a.energy + 3); break;
    case 'heal':
      a.health = Math.min(100, a.health + 2.5); a.energy = Math.min(100, a.energy + 0.5);
      if (a.infected && (w.cureResearch >= 100 || r() < 0.01 + a.skills.medicine * 0.002)) { a.infected = false; hist(a, 'Recovered from the plague.'); }
      break;
    case 'gather': {
      const res = RES_OF[a.loc]; if (!res) break;
      const mult = a.loc === 'farm' ? m.farm : a.loc === 'mine' ? m.mine : 1;
      const res2: Res = a.loc === 'forest' && g.faction === 'Wilds' && r() < 0.5 ? 'herbs' : res;
      if (r() < (0.18 + a.skills.gathering * 0.02) * mult) {
        a.inv[res2]++; a.skills.gathering += 0.02; gainXp(w, a, 1, at);
        if (w.event?.kind === 'Faction Challenge') w.event.tally[g.faction]++;
        if (w.event?.kind === 'Earthquake' && res2 === 'wood') w.event.progress++;
      }
      if (a.loc === 'mine' && w.event?.kind === 'Earthquake' && r() < 0.02) a.health -= 8;
      a.energy -= 0.1;
      break;
    }
    case 'trade': {
      if (a.loc !== 'market') break;
      for (const k of ['wood', 'ore', 'herbs', 'food'] as Res[]) {
        const keep = k === 'food' ? 3 : 0;
        if (a.inv[k] > keep) {
          const p = w.prices[k] * m.sell * (1 + a.skills.trade * 0.02);
          a.inv[k]--; a.coins += p * 0.8; w.stock[g.faction][k]++; w.renown[g.faction] += 0.05;
          w.prices[k] = Math.max(0.5, +(w.prices[k] - 0.03).toFixed(2)); a.skills.trade += 0.02; gainXp(w, a, 1, at);
          break;
        }
      }
      if (a.coins >= 120) achieve(w, a, 'Merchant Prince', at);
      break;
    }
    case 'craft':
      if (a.inv.ore >= 3 && a.inv.wood >= 2) {
        a.inv.ore -= 3; a.inv.wood -= 2; a.skills.crafting += 0.3;
        if (a.weapon <= a.armor) a.weapon++; else a.armor++;
        gainXp(w, a, 6, at); hist(a, `Forged gear at the Gods' Workshop (weapon ${a.weapon}, armor ${a.armor}).`);
        if (a.weapon >= 4) achieve(w, a, 'Master Smith', at);
      }
      break;
    case 'socialize': {
      if (here.length < 2) { a.mood = Math.min(100, a.mood + 0.5); break; }
      const b = here[Math.floor(r() * here.length)];
      if (b.id === a.id || !b.alive) break;
      const gb = G()[b.id - 1];
      const delta = (g.faction === gb.faction ? 1.5 : 0.6) * (g.traits.sociability + 0.3) - (g.traits.greed > 0.8 && gb.traits.greed > 0.8 ? 1.2 : 0);
      bump(a, b.id, delta); bump(b, a.id, delta);
      a.mood = Math.min(100, a.mood + 4);
      if (w.event?.kind === 'Black Plague' && b.infected && !a.infected && r() < 0.06) { a.infected = true; hist(a, 'Caught the plague.'); }
      if ((a.rel[b.id] ?? 0) >= 20 && !a.history.some((h) => h.includes(gb.name))) hist(a, `Became close friends with ${gb.name}.`);
      break;
    }
    case 'train':
      a.skills.combat += 0.05; a.energy -= 0.25; gainXp(w, a, 1, at);
      break;
    case 'duel': {
      if (a.loc !== 'arena' || a.health < 60) break;
      const foe = here.find((b) => b.id !== a.id && b.act === 'duel' && b.health >= 60 && b.timer > 0);
      if (foe && r() < 0.3) runDuel(w, a, foe, at);
      break;
    }
    case 'explore': {
      a.skills.scouting += 0.03; a.energy -= 0.15;
      const danger = a.loc === 'dungeon' ? 0.05 : 0.01;
      if (r() < danger) a.health -= 6 + r() * 6;
      if (r() < 0.006 * m.relic * (a.loc === 'dungeon' ? 2 : 1)) {
        a.discoveries++; a.score += 15; gainXp(w, a, 12, at);
        const finds = ['a sealed reliquary', 'an ember map', 'a moonstone idol', 'a lost god-shard', 'a drowned bell', 'a chart of the far coast'];
        const what = finds[Math.floor(r() * finds.length)];
        hist(a, `Discovered ${what} in ${LOC[a.loc].name}.`);
        chron(w, at, 'discovery', `${g.name} discovered ${what} in ${LOC[a.loc].name}.`, `#/inhabitant/${a.id}`);
        if (a.discoveries >= 3) achieve(w, a, 'Pathfinder', at);
        if (w.event?.kind === 'Ancient Discovery') w.event.progress += 1;
      }
      if (a.health <= 0) die(w, a, `the dangers of ${LOC[a.loc].name}`, at);
      break;
    }
    case 'patrol': {
      if (w.influence[a.loc]) { w.influence[a.loc][g.faction] += 0.3 * m.patrol * (1 + g.traits.loyalty); a.score += 0.2; }
      if (a.loc.startsWith('frontier') && w.monsters > 0 && r() < 0.15) {
        const kill = power(a) > 40 + r() * 40;
        if (kill) { w.monsters--; w.event && (w.event.progress++); gainXp(w, a, 4, at); }
        else { a.health -= 5 + r() * 10; if (a.health <= 0) die(w, a, 'a monster from the frontier', at); }
      }
      break;
    }
    case 'research':
      if (a.loc !== 'infirmary') break;
      if (a.inv.herbs > 0) { a.inv.herbs--; w.cureResearch = Math.min(100, w.cureResearch + 0.6 + a.skills.medicine * 0.05); a.score += 1; a.skills.medicine += 0.05; gainXp(w, a, 2, at); if (w.event) w.event.progress = w.cureResearch; }
      else if (w.event?.stance[g.faction] === 'cooperate') { const st = w.stock[g.faction]; if (st.herbs > 0) { st.herbs--; w.cureResearch = Math.min(100, w.cureResearch + 0.4); if (w.event) w.event.progress = w.cureResearch; } }
      break;
    case 'raid': {
      if (a.loc !== 'boss') break;
      const raiders = here.filter((b) => b.act === 'raid');
      if (raiders.length < 3) break;
      const dmg = Math.round(power(a) / 10);
      w.boss.hp -= dmg; a.health -= 1.5; a.score += 0.5;
      if (a.health <= 0) die(w, a, 'the Ashen Wyrm', at);
      if (w.boss.hp <= 0) {
        w.boss.defeats++; w.boss.hp = w.boss.max = 4000 + w.boss.defeats * 1500;
        for (const b of raiders) { gainXp(w, b, 40, at); achieve(w, b, 'Wyrmslayer', at); }
        chron(w, at, 'boss', `${raiders.length} raiders led by ${g.name} slew the Ashen Wyrm. It will rise again stronger.`, `#/inhabitant/${a.id}`);
      }
      break;
    }
  }
}
function power(a: Agent) { const f = fighter(a); return 10 + f.str * 1.2 + f.agi * 0.8 + f.combat * 2 + f.level * 3 + f.weapon * 6; }
function bump(a: Agent, id: number, d: number) {
  a.rel[id] = Math.round(((a.rel[id] ?? 0) + d) * 10) / 10;
  const keys = Object.keys(a.rel);
  if (keys.length > 8) { keys.sort((x, y) => Math.abs(a.rel[x]) - Math.abs(a.rel[y])); delete a.rel[keys[0]]; }
}

export function runDuel(w: World, a: Agent, b: Agent, at: number): DuelResult {
  const res = duel(`D-${w.season}-${w.tick}-${Math.min(a.id, b.id)}-${Math.max(a.id, b.id)}`, fighter(a), fighter(b));
  const win = w.agents[res.winner - 1], lose = w.agents[res.loser - 1];
  win.wins++; lose.losses++; win.score += 20; gainXp(w, win, 15, at); gainXp(w, lose, 5, at);
  lose.health = Math.max(5, lose.health - 30); win.health = Math.max(5, win.health - 10);
  bump(win, lose.id, -3); bump(lose, win.id, -5);
  const gw = G()[win.id - 1], gl = G()[lose.id - 1];
  hist(win, `Won a duel against ${gl.name} (${res.reason}).`); hist(lose, `Lost a duel to ${gw.name}.`);
  if (win.wins >= 5) achieve(w, win, 'Arena Champion', at);
  w.duels.unshift(res); if (w.duels.length > 60) w.duels.length = 60;
  chron(w, at, 'duel', `${gw.name} defeated ${gl.name} in the Arena of Ash by ${res.reason}.`, `#/arena/${res.duelId}`);
  win.timer = 0; lose.timer = 0;
  return res;
}

// ---------- Events ----------
const TARGET: Record<EventKind, number> = { 'Black Plague': 100, Drought: 1, 'Harsh Winter': 1, 'Monster Invasion': 40, 'Ore Shortage': 1, 'Ancient Discovery': 6, 'Border Dispute': 1, 'Trade Caravan': 1, Earthquake: 60, 'Faction Challenge': 1 };

/** Starts the event for the current UTC slot exactly once, settling the previous one first. */
export function syncEvent(w: World, now: number) {
  const ev = currentEvent(now);
  if (w.event && w.event.id !== ev.id && !w.event.settled) settle(w, now);
  if (w.executed.includes(ev.id)) return; // duplicate-execution guard
  w.executed.push(ev.id); if (w.executed.length > 200) w.executed.shift();
  w.event = { id: ev.id, kind: ev.kind, start: ev.start, end: ev.end, progress: 0, target: TARGET[ev.kind], stance: zeroF(() => 'cooperate' as const), tally: zeroF(() => 0), settled: false };
  if (ev.kind === 'Black Plague') {
    w.cureResearch = 0;
    const r = mulberry32(hashStr(ev.id));
    for (let i = 0; i < 25; i++) { const a = w.agents[Math.floor(r() * 1000)]; if (a.alive) a.infected = true; }
    w.prices.herbs = +(w.prices.herbs * 1.8).toFixed(2);
  }
  if (ev.kind === 'Monster Invasion') w.monsters = 60;
  if (ev.kind === 'Ore Shortage') w.prices.ore = +(w.prices.ore * 2).toFixed(2);
  if (ev.kind === 'Drought') w.prices.food = +(w.prices.food * 1.6).toFixed(2);
  if (ev.kind === 'Harsh Winter') w.prices.wood = +(w.prices.wood * 1.6).toFixed(2);
  chron(w, now, 'event', `${ev.kind} began (${ev.id}). ${EVENT_INFO[ev.kind].effect}`, '#/events');
}

function eventTick(w: World, byLoc: Map<string, Agent[]>) {
  const e = w.event!;
  if (e.kind === 'Black Plague' && w.tick % 5 === 0) {
    for (const [, list] of byLoc) {
      if (list.length < 2 || !list.some((a) => a.infected)) continue;
      const r = mulberry32(hashStr(`${e.id}/${w.tick}/${list[0].loc}`));
      for (const a of list) if (!a.infected && r() < 0.02 && w.cureResearch < 100) a.infected = true;
    }
    if (w.cureResearch >= 100 && e.progress < 100) e.progress = 100;
  }
  if (e.kind === 'Border Dispute' || e.kind === 'Drought' || e.kind === 'Harsh Winter' || e.kind === 'Ore Shortage' || e.kind === 'Trade Caravan') e.progress = Math.min(1, e.progress + 1 / 600);
  if (e.kind === 'Faction Challenge') e.progress = Math.max(...FACTIONS.map((f) => e.tally[f])) > 50 ? 1 : 0;
}

export function settle(w: World, now: number) {
  const e = w.event;
  if (!e || e.settled) return;
  const key = `${e.id}:settled`;
  if (w.executed.includes(key)) { e.settled = true; return; }
  const alive = w.agents.filter((a) => a.alive).length;
  const infected = w.agents.filter((a) => a.infected).length;
  const input: Record<string, number> = { score: e.progress, threshold: e.target, alive, infected, ticks: w.tick };
  e.oracle = judge(e.id, e.kind, input, now);
  e.settled = true; w.executed.push(key);
  if (e.kind === 'Faction Challenge') {
    const champ = [...FACTIONS].sort((x, y) => e.tally[y] - e.tally[x] || FACTIONS.indexOf(x) - FACTIONS.indexOf(y))[0];
    w.renown[champ] += 50;
  }
  if (e.kind === 'Black Plague') for (const a of w.agents) if (a.infected && w.cureResearch >= 100) a.infected = false;
  chron(w, now, 'oracle', `Judgment on ${e.kind} (${e.id}): ${e.oracle.result}. Rule-based fallback, inputs recorded.`, '#/events');
}

// ---------- Seasons ----------
export function syncSeason(w: World, now: number) {
  const s = seasonAt(now);
  if (s.id === w.season) return;
  if (!w.archive.some((x) => x.id === w.season)) {
    const top = rank(w.agents).slice(0, 10).map((a) => ({ id: a.id, score: Math.round(a.score), level: a.level }));
    const factions = zeroF(() => 0);
    for (const a of w.agents) factions[G()[a.id - 1].faction] += a.score;
    for (const f of FACTIONS) factions[f] = Math.round(factions[f] + w.renown[f]);
    w.archive.unshift({ id: w.season, start: w.seasonStart, end: w.seasonStart + 15 * 86400e3, top, factions, checksum: checksum(JSON.stringify({ top, factions })), prize: 'No prize pool: no economy contract is deployed.' });
    chron(w, now, 'season', `Season ${w.season} closed. ${G()[top[0].id - 1].name} finished first.`, '#/season');
  }
  for (const a of w.agents) { a.score = 0; a.wins = 0; a.losses = 0; }
  w.renown = zeroF(() => 0);
  w.season = s.id; w.seasonStart = s.start;
}

// ---------- God decisions (validated) ----------
export const PRIORITIES: Action[] = ['gather', 'trade', 'craft', 'train', 'explore', 'patrol', 'research', 'rest', 'heal', 'socialize', 'duel', 'raid'];

export function decide(w: World, agentId: number, kind: 'priority' | 'goto' | 'duel' | 'stance', arg: string, now: number): Decision {
  const a = w.agents[agentId - 1];
  const g = G()[agentId - 1];
  const d: Decision = { id: `DC-${w.decisions.length + 1}-${w.tick}`, at: now, agent: agentId, text: '', status: 'accepted', reason: '', cost: 'none' };
  const reject = (why: string) => { d.status = 'rejected'; d.reason = why; };
  if (!w.adopted.includes(agentId)) reject('You have not adopted this inhabitant.');
  else if (!a.alive) reject('This inhabitant has fallen. Memorials take no orders.');
  else if (kind === 'priority') {
    d.text = arg === 'none' ? 'Clear priority' : `Set priority: ${arg}`;
    if (arg !== 'none' && !PRIORITIES.includes(arg as Action)) reject('Unknown priority.');
    else if (arg === 'raid' && a.level < 5) reject(`Raids need level 5. ${g.name} is level ${a.level}.`);
    else if (arg === 'duel' && a.level < 2) reject('Duels need level 2.');
    else { a.priority = arg === 'none' ? null : (arg as Action); d.reason = 'Weighs into every choice until changed.'; d.status = 'done'; }
  } else if (kind === 'goto') {
    const l = LOC[arg];
    d.text = `Go to ${l?.name ?? arg}`;
    if (!l) reject('Unknown place.');
    else if (l.kind === 'dungeon' && a.level < 3) reject(`The Hollow Deep needs level 3. ${g.name} is level ${a.level}.`);
    else if (l.kind === 'boss' && a.level < 5) reject(`Ashen Crag needs level 5. ${g.name} is level ${a.level}.`);
    else if ((l.kind === 'dungeon' || l.kind === 'boss') && a.health < 50) reject('Health must be at least 50 for this journey.');
    else if (a.energy < 10) reject('Too tired to travel. Order rest first.');
    else { a.task = { kind: 'goto', loc: arg, decisionId: d.id }; a.timer = 0; a.energy -= 5; d.cost = '5 energy'; d.reason = 'Travelling now.'; }
  } else if (kind === 'duel') {
    const b = w.agents[Number(arg) - 1];
    d.text = `Challenge #${arg} to a duel`;
    if (!b) reject('No such inhabitant.');
    else if (b.id === a.id) reject('An inhabitant cannot duel itself.');
    else if (!b.alive) reject('The opponent has fallen.');
    else if (a.health < 60 || b.health < 60) reject('Both duelists need at least 60 health.');
    else if (a.coins < 5) reject('A duel costs 5 coins of arena fee.');
    else { a.coins -= 5; d.cost = '5 coins'; a.task = { kind: 'duel', loc: 'arena', target: b.id, decisionId: d.id }; a.timer = 0; b.task = { kind: 'goto', loc: 'arena', decisionId: d.id }; b.timer = 0; d.reason = 'Both are walking to the Arena of Ash.'; }
  } else if (kind === 'stance') {
    d.text = `Faction stance for ${w.event?.kind ?? 'event'}: ${arg}`;
    if (!w.event || w.event.settled) reject('No open event to take a stance on.');
    else if (arg !== 'cooperate' && arg !== 'compete') reject('Stance must be cooperate or compete.');
    else { w.event.stance[g.faction] = arg; d.status = 'done'; d.reason = arg === 'cooperate' ? `${g.faction} shares its stockpile with the shared effort.` : `${g.faction} keeps its stockpile for its own.`; }
  }
  w.decisions.unshift(d); if (w.decisions.length > 80) w.decisions.length = 80;
  return d;
}

export function adopt(w: World, id: number): string | null {
  if (w.adopted.includes(id)) return null;
  if (w.adopted.length >= 3) return 'You can guide up to 3 inhabitants. Release one first.';
  if (!w.agents[id - 1]?.alive) return 'Fallen inhabitants rest in the Memorial Grounds and cannot be adopted.';
  w.adopted.push(id); return null;
}
export function release(w: World, id: number) { w.adopted = w.adopted.filter((x) => x !== id); w.agents[id - 1].priority = null; }

/** Advances the world to `now`, at most `cap` ticks, keeping events and seasons in step. */
export function advance(w: World, now: number, cap = 900): number {
  syncSeason(w, now);
  const due = Math.min(cap, Math.max(0, Math.floor((now - w.lastReal) / TICK_MS)));
  const startReal = now - due * TICK_MS;
  for (let i = 0; i < due; i++) {
    const at = startReal + (i + 1) * TICK_MS;
    if (i % 60 === 0) syncEvent(w, at);
    tick(w, at);
  }
  syncEvent(w, now);
  w.lastReal = now;
  return due;
}

export function summary(w: World) {
  const alive = w.agents.filter((a) => a.alive);
  const per = zeroF(() => ({ alive: 0, fallen: 0, score: 0, level: 0 }));
  for (const a of w.agents) { const f = per[G()[a.id - 1].faction]; if (a.alive) f.alive++; else f.fallen++; f.score += a.score; f.level += a.level; }
  return { alive: alive.length, fallen: 1000 - alive.length, infected: alive.filter((a) => a.infected).length, per };
}
