import { describe, expect, it } from 'vitest';
import { genesisCollection, portraitSvg, FACTIONS, RARITY_COUNTS } from '../src/sim/genesis';
import { buildCollection } from '../src/sim/collection';
import { duel, eventKind, eventsAround, currentEvent, rank, seasonAt, SEASON_MS, judge } from '../src/sim/rules';
import { advance, adopt, decide, newWorld, settle, syncEvent, tick } from '../src/sim/sim';

const T0 = Date.UTC(2026, 10, 3, 10, 0, 0);

describe('Genesis collection', () => {
  const all = genesisCollection();
  it('has exactly 1,000 unique inhabitants', () => {
    expect(all.length).toBe(1000);
    expect(new Set(all.map((g) => g.name)).size).toBe(1000);
    expect(new Set(all.map((g) => g.dna)).size).toBe(1000);
    expect(new Set(all.map(portraitSvg)).size).toBe(1000);
    expect(all.map((g) => g.id)).toEqual(Array.from({ length: 1000 }, (_, i) => i + 1));
  });
  it('splits factions evenly and matches rarity counts', () => {
    for (const f of FACTIONS) expect(all.filter((g) => g.faction === f).length).toBe(250);
    for (const [r, n] of Object.entries(RARITY_COUNTS)) expect(all.filter((g) => g.rarity === r).length).toBe(n);
  });
  it('builds a manifest with valid references for every token', () => {
    const { manifest, files } = buildCollection();
    expect(manifest.size).toBe(1000);
    expect(manifest.allValid).toBe(true);
    const paths = new Set(files.map((f) => f.path));
    for (const t of manifest.tokens) {
      expect(paths.has(`genesis/${t.image}`)).toBe(true);
      expect(paths.has(`genesis/${t.metadata}`)).toBe(true);
    }
    const meta = JSON.parse(files.find((f) => f.path === 'genesis/metadata/1.json')!.content);
    expect(meta.name).toMatch(/#1$/);
    expect(Array.isArray(meta.attributes)).toBe(true);
  });
});

describe('Rules', () => {
  const a = { id: 1, str: 12, agi: 9, vit: 10, level: 3, combat: 4, weapon: 1, armor: 1 };
  const b = { id: 2, str: 9, agi: 13, vit: 8, level: 3, combat: 5, weapon: 1, armor: 0 };
  it('duels are reproducible from the duel id', () => {
    expect(duel('D-x', a, b)).toEqual(duel('D-x', a, b));
    const ids = Array.from({ length: 40 }, (_, i) => duel(`D-${i}`, a, b).winner);
    expect(new Set(ids).size).toBeGreaterThan(0);
    for (const r of [duel('D-y', a, b)]) expect([1, 2]).toContain(r.winner);
  });
  it('identical fighters tie-break deterministically', () => {
    const r = duel('D-tie', { ...a, id: 5 }, { ...a, id: 9 });
    expect(r.winner === 5 || r.winner === 9).toBe(true);
    expect(duel('D-tie', { ...a, id: 5 }, { ...a, id: 9 }).winner).toBe(r.winner);
  });
  it('seasons are exactly 15 days in UTC', () => {
    const s = seasonAt(T0);
    expect(s.end - s.start).toBe(SEASON_MS);
    expect(seasonAt(s.start).id).toBe(s.id);
    expect(seasonAt(s.end).n).toBe(s.n + 1);
    expect(seasonAt(Date.UTC(2026, 0, 1)).id).toBe('S1');
  });
  it('events start at 09, 15 and 21 UTC with stable ids', () => {
    const list = eventsAround(T0, 3, 6);
    for (const e of list) expect([9, 15, 21]).toContain(new Date(e.start).getUTCHours());
    const cur = currentEvent(T0);
    expect(cur.start).toBe(Date.UTC(2026, 10, 3, 9));
    expect(cur.id).toBe('EV-20261103-09');
    expect(eventKind(cur.start)).toBe(cur.kind);
    // Black Plague recurs every third evening
    const evenings = Array.from({ length: 6 }, (_, d) => eventKind(Date.UTC(2026, 10, 1 + d, 21)));
    expect(evenings.filter((k) => k === 'Black Plague').length).toBe(2);
  });
  it('ranking ties break by level then lower id', () => {
    const r = rank([{ id: 3, score: 10, level: 1 }, { id: 2, score: 10, level: 1 }, { id: 9, score: 10, level: 4 }, { id: 1, score: 20, level: 1 }]);
    expect(r.map((x) => x.id)).toEqual([1, 9, 2, 3]);
  });
  it('oracle fallback only returns allowed outcomes', () => {
    const j = judge('EV-1', 'Black Plague', { score: 100, threshold: 100 }, T0);
    expect(j.allowed).toContain(j.result);
    expect(j.result).toBe('Cure found');
    expect(judge('EV-1', 'Black Plague', { score: 3, threshold: 100 }, T0).result).toBe('Plague burned out unchecked');
  });
});

describe('Simulation', () => {
  it('is deterministic for the same start and ticks', () => {
    const w1 = newWorld(T0), w2 = newWorld(T0);
    advance(w1, T0 + 300_000); advance(w2, T0 + 300_000);
    expect(JSON.stringify(w1.agents)).toBe(JSON.stringify(w2.agents));
    expect(w1.tick).toBe(300);
  });
  it('inhabitants act differently and move', () => {
    const w = newWorld(T0);
    advance(w, T0 + 600_000);
    const acts = new Set(w.agents.map((a) => a.act));
    expect(acts.size).toBeGreaterThan(5);
    const moved = w.agents.filter((a) => a.loc !== `hq-${['Ironborn', 'Wilds', 'Veil', 'Crown'].find((f) => a.loc.endsWith(f))}`).length;
    expect(moved).toBeGreaterThan(200);
    expect(w.agents.some((a) => a.xp > 0)).toBe(true);
  });
  it('never executes the same event twice', () => {
    const w = newWorld(T0);
    syncEvent(w, T0); syncEvent(w, T0 + 1000); syncEvent(w, T0 + 5000);
    expect(w.executed.filter((x) => x === 'EV-20261103-09').length).toBe(1);
    expect(w.chronicle.filter((c) => c.kind === 'event').length).toBe(1);
    settle(w, T0); settle(w, T0);
    expect(w.chronicle.filter((c) => c.kind === 'oracle').length).toBe(1);
  });
  it('settles the previous event when the next slot starts', () => {
    const w = newWorld(T0);
    syncEvent(w, T0);
    syncEvent(w, Date.UTC(2026, 10, 3, 15, 0, 1));
    expect(w.executed).toContain('EV-20261103-09:settled');
    expect(w.event?.id).toBe('EV-20261103-15');
  });
  it('validates god orders', () => {
    const w = newWorld(T0);
    expect(decide(w, 5, 'priority', 'gather', T0).status).toBe('rejected');
    expect(adopt(w, 5)).toBeNull();
    expect(decide(w, 5, 'priority', 'gather', T0).status).toBe('done');
    expect(w.agents[4].priority).toBe('gather');
    expect(decide(w, 5, 'goto', 'dungeon', T0).status).toBe('rejected');
    expect(decide(w, 5, 'goto', 'market', T0).status).toBe('accepted');
    expect(decide(w, 5, 'duel', '5', T0).status).toBe('rejected');
    expect(decide(w, 5, 'duel', '6', T0).status).toBe('accepted');
    adopt(w, 6); adopt(w, 7);
    expect(adopt(w, 8)).toMatch(/up to 3/);
  });
  it('a challenged duel resolves at the arena and is recorded', () => {
    const w = newWorld(T0);
    adopt(w, 10);
    decide(w, 10, 'duel', '11', T0);
    for (let i = 0; i < 200 && w.duels.length === 0; i++) tick(w, T0 + i * 1000);
    expect(w.duels.length).toBeGreaterThan(0);
    expect([10, 11]).toContain(w.duels[0].winner);
  });
  it('Black Plague infects and can be cured with research', () => {
    const plague = Date.UTC(2026, 10, 4, 21, 0, 0); // day index divisible by 3
    const w = newWorld(plague);
    syncEvent(w, plague);
    if (w.event?.kind !== 'Black Plague') {
      // find the next plague slot
      let t = plague; while ((w.event?.kind as string) !== "Black Plague") { t += 86400e3; syncEvent(w, t); }
    }
    expect(w.agents.filter((a) => a.infected).length).toBeGreaterThan(10);
    w.cureResearch = 100; w.event!.progress = 100;
    settle(w, plague + 1000);
    expect(w.event?.oracle?.result).toBe('Cure found');
    expect(w.agents.filter((a) => a.infected).length).toBe(0);
  });
  it('the fallen become memorials and keep their identity', () => {
    const w = newWorld(T0);
    const a = w.agents[0];
    a.health = 0.01; a.food = 0;
    tick(w, T0);
    expect(a.alive).toBe(false);
    expect(a.loc).toBe('memorial');
    expect(a.died?.cause).toBe('starvation');
    expect(w.chronicle[0].kind).toBe('death');
    expect(adopt(w, 1)).toMatch(/Memorial/);
  });
});
