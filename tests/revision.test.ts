import { describe, expect, it } from 'vitest';
import { posix } from 'node:path';
import { buildCollection } from '../src/sim/collection';
import { genesisCollection, portraitSvg, visualPortrait } from '../src/sim/genesis';
import { adopt, advance, chron, decide, gainXp, newWorld, settle, syncEvent, tick, trade } from '../src/sim/sim';

const T0 = Date.UTC(2026, 10, 3, 10);

describe('reported collection regressions', () => {
  it('resolves every reference from its metadata directory', () => {
    const { files, manifest } = buildCollection();
    const paths = new Set(['index.html', ...files.map(f => f.path)]);
    for (const f of files.filter(f => f.path.startsWith('genesis/metadata/'))) {
      const m = JSON.parse(f.content);
      for (const reference of [m.image, m.external_url]) expect(paths.has(posix.normalize(posix.join(posix.dirname(f.path), reference.split('#')[0])))).toBe(true);
    }
    expect(manifest.allValid).toBe(true);
    expect(manifest.distinctVisualHashes).toBe(1000);
  });
  it('keeps descriptive labels but all 1000 canonical artworks differ', () => {
    const portraits = genesisCollection().map(portraitSvg);
    expect(portraits.every(svg => svg.includes('aria-label='))).toBe(true);
    expect(new Set(portraits.map(visualPortrait)).size).toBe(1000);
    expect(visualPortrait(portraits[504])).not.toBe(visualPortrait(portraits[972]));
  });
});

describe('permanent evidence', () => {
  it('keeps memorials and character history beyond the former caps', () => {
    const w = newWorld(T0); chron(w, T0, 'death', 'TEST MEMORIAL');
    for (let i = 0; i < 401; i++) chron(w, T0 + i, 'discovery', `Discovery ${i}`);
    expect(w.chronicle).toHaveLength(403);
    expect(w.chronicle.some(c => c.text === 'TEST MEMORIAL')).toBe(true);
    for (let i = 0; i < 30; i++) gainXp(w, w.agents[0], 1000000, T0 + i);
    expect(w.agents[0].history).toHaveLength(30);
    expect(w.agents[0].history.at(-1)).toBe('Reached level 2.');
  });
  it('archives complete Oracle requests across rollovers and prevents replay', () => {
    const t = Date.UTC(2026, 10, 5, 21), w = newWorld(t); syncEvent(w, t);
    const old = w.event!; syncEvent(w, old.end); settle(w, w.event!.end); settle(w, w.event!.end);
    const saved = w.eventHistory.find(e => e.id === old.id)!;
    expect(saved.oracle?.id).toBe(`OR-${old.id}`);
    expect(saved.oracle?.allowed).toContain(saved.oracle?.result);
    expect(saved.oracle?.verification).toBe('fallback-deterministic');
    expect(saved.oracle?.at).toBe(old.end);
    expect(saved.oracle?.source).toBeTruthy();
    expect(w.eventHistory.filter(e => e.id === w.event!.id)).toHaveLength(1);
    expect(JSON.parse(JSON.stringify(w)).eventHistory[1].oracle).toEqual(saved.oracle);
  });
  it('no champion earns no reward, threshold is strict, ties are documented faction order', () => {
    for (const count of [0, 50, 51]) {
      const t = Date.UTC(2026, 10, 5, 21), w = newWorld(t); syncEvent(w, t);
      expect(w.event!.kind).toBe('Faction Challenge');
      w.event!.tally.Ironborn = w.event!.tally.Wilds = count;
      settle(w, w.event!.end); settle(w, w.event!.end);
      expect(w.event!.oracle?.result).toBe(count > 50 ? 'Champion faction crowned' : 'No champion');
      expect(w.renown).toEqual({ Ironborn: count > 50 ? 50 : 0, Wilds: 0, Veil: 0, Crown: 0 });
    }
  });
  it('a bounded advance preserves backlog and processes all crossed event slots', () => {
    const w = newWorld(T0);
    advance(w, T0 + 5000, 2); expect(w.lastReal).toBe(T0 + 2000);
    advance(w, T0 + 5000, 2); advance(w, T0 + 5000, 2);
    expect(w.tick).toBe(5); expect(w.lastReal).toBe(T0 + 5000);
    const near = Date.UTC(2026, 10, 3, 14, 59, 58), rollover = newWorld(near);
    advance(rollover, near + 5000);
    expect(rollover.eventHistory[0].id).toBe('EV-20261103-09');
    expect(rollover.event!.id).toBe('EV-20261103-15');
  });
});

describe('duel rendezvous', () => {
  it.each([[1, 251], [251, 1]])('reserves both participants and resolves only after both arrive (%s -> %s)', (id, rival) => {
    const w = newWorld(T0); adopt(w, id); const d = decide(w, id, 'duel', String(rival), T0);
    for (let i = 0; i < 52; i++) tick(w, T0 + i * 1000);
    expect(d.status).toBe('accepted'); expect(w.duels).toHaveLength(0);
    expect(w.agents[rival - 1].task?.decisionId).toBe(d.id);
    for (let i = 52; i < 250 && d.status === 'accepted'; i++) tick(w, T0 + i * 1000);
    expect(d.status).toBe('done'); expect(w.duels).toHaveLength(1);
    expect(w.agents[id - 1].arrived && w.agents[rival - 1].arrived).toBe(true);
    expect(d.reason).toContain(w.duels[0].duelId);
  });
  it('rejects competing orders and fails reservations if a participant falls', () => {
    const w = newWorld(T0); adopt(w, 1); adopt(w, 251);
    const d = decide(w, 1, 'duel', '251', T0);
    expect(decide(w, 251, 'goto', 'market', T0).status).toBe('rejected');
    expect(decide(w, 1, 'duel', '2', T0).status).toBe('rejected');
    w.agents[250].health = 0; w.agents[250].food = 0; tick(w, T0 + 1000);
    expect(d.status).toBe('failed'); expect(w.duels).toHaveLength(0);
    expect(w.agents[0].task).toBeNull();
  });
});

describe('market trades', () => {
  it('checks location, stock, coins, survival reserve and stores real inventory changes', () => {
    const w = newWorld(T0); adopt(w, 1); const a = w.agents[0];
    expect(() => trade(w, 1, 'food', 'buy', 1, T0)).toThrow(/Grand Market/);
    a.loc = 'market'; a.arrived = true;
    const coins = a.coins, food = a.inv.food;
    trade(w, 1, 'food', 'buy', 1, T0);
    expect(a.coins).toBe(coins - 3); expect(a.inv.food).toBe(food + 1);
    trade(w, 1, 'food', 'sell', 1, T0); expect(a.inv.food).toBe(3);
    expect(() => trade(w, 1, 'food', 'sell', 1, T0)).toThrow(/Keep 3/);
    expect(() => trade(w, 1, 'ore', 'buy', 100, T0)).toThrow(/stockpile/);
    expect(() => trade(w, 1, 'food', 'buy', NaN, T0)).toThrow(/quantity/);
    a.coins = 0; expect(() => trade(w, 1, 'food', 'buy', 1, T0)).toThrow(/coins/);
    expect(w.chronicle.filter(c => c.kind === 'trade')).toHaveLength(2);
  });
});
