import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { GameService } from '../server/service';
import { gameServer } from '../server/http';
import { chron, gainXp, settle, syncEvent } from '../src/sim/sim';

const services: GameService[] = [], dirs: string[] = [];
function open(now = Date.now(), file?: string) {
  const dir = file ? '' : mkdtempSync(join(tmpdir(), 'gods-service-'));
  if (dir) dirs.push(dir);
  const path = file ?? join(dir, 'world.sqlite');
  const game = new GameService(path, now); services.push(game); return { game, path };
}
function close(game: GameService) { game.close(); services.splice(services.indexOf(game), 1); }
afterEach(() => { for (const game of services.splice(0)) game.close(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); vi.useRealTimers(); });

describe('authoritative persistence and multiplayer', () => {
  it('reserves an inhabitant exclusively and authorizes orders by server session', () => {
    const { game } = open(); const a = game.createSession(), b = game.createSession();
    game.command(a, 'request-adopt-a', { type: 'adopt', id: 1 });
    expect(() => game.command(b, 'request-adopt-b', { type: 'adopt', id: 1 })).toThrow(/already guides/);
    expect(game.snapshot(a).world.adopted).toEqual([1]); expect(game.snapshot(b).world.adopted).toEqual([]);
    expect(game.snapshot(b).world.claimed).toEqual([1]);
    expect(() => game.command(b, 'request-order-b', { type: 'decision', id: 1, kind: 'priority', arg: 'gather' })).toThrow(/Only the player/);
    for (const id of [2, 3]) game.command(a, `request-adopt-${id}`, { type: 'adopt', id });
    expect(() => game.command(a, 'request-adopt-4', { type: 'adopt', id: 4 })).toThrow(/up to 3/);
    game.command(b, 'request-adopt-5', { type: 'adopt', id: 5 });
    expect(game.snapshot(b).world.adopted).toEqual([5]);
    game.command(a, 'request-release-1', { type: 'release', id: 1 });
    game.command(b, 'request-newowner-1', { type: 'adopt', id: 1 });
    expect(game.snapshot(b).world.adopted).toEqual([1, 5]);
  });
  it('retains ownership, orders, time and immutable evidence after restart', () => {
    const t = Date.UTC(2026, 10, 5, 21), { game, path } = open(t);
    const token = game.createSession(); game.command(token, 'request-adopt-1', { type: 'adopt', id: 1 }, t);
    chron(game.world, t, 'death', 'TEST MEMORIAL');
    for (let i = 0; i < 401; i++) chron(game.world, t + i, 'discovery', `Discovery ${i}`);
    for (let i = 0; i < 30; i++) gainXp(game.world, game.world.agents[0], 1000000, t + i);
    syncEvent(game.world, t); settle(game.world, t + 1);
    game.pump(t + 2000);
    const length = game.world.chronicle.length;
    expect(() => game.db.exec('DELETE FROM chronicle')).toThrow(/append only/);
    expect(() => game.db.exec("UPDATE character_history SET text='changed'")).toThrow(/append only/);
    expect(() => game.db.exec('DELETE FROM event_history')).toThrow(/append only/);
    close(game);
    const { game: restarted } = open(t + 2000, path);
    expect(restarted.snapshot(token).world.adopted).toEqual([1]);
    expect(restarted.world.tick).toBe(2); expect(restarted.world.chronicle).toHaveLength(length);
    expect(restarted.world.agents[0].history.at(-1)).toBe('Reached level 2.');
    expect(restarted.world.eventHistory[0].oracle?.id).toBe('OR-EV-20261105-21');
    let before = Number.MAX_SAFE_INTEGER, records = [];
    for (;;) { const batch = restarted.records(null, before); if (!batch.length) break; records.push(...batch); before = batch.at(-1)!.sequence; }
    expect(records).toHaveLength(length);
    expect(records.some(c => c.text === 'TEST MEMORIAL')).toBe(true);
    expect(restarted.records('death', Number.MAX_SAFE_INTEGER).some(c => c.text === 'TEST MEMORIAL')).toBe(true);
  });
  it('deduplicates command retries and rolls back rejected trades', () => {
    const { game } = open(); const token = game.createSession();
    game.command(token, 'request-adopt-1', { type: 'adopt', id: 1 });
    const c = { type: 'decision' as const, id: 1, kind: 'duel' as const, arg: '251' };
    const one = game.command(token, 'request-duel-1', c);
    const coins = game.world.agents[0].coins;
    expect(game.command(token, 'request-duel-1', c).message).toBe(one.message);
    expect(game.world.agents[0].coins).toBe(coins);
    expect(() => game.command(token, 'request-duel-1', { ...c, arg: '2' })).toThrow(/another command/);
    const state = JSON.stringify(game.world);
    expect(() => game.command(token, 'request-trade-1', { type: 'trade', id: 1, resource: 'food', side: 'buy', quantity: 1 })).toThrow(/Grand Market/);
    expect(JSON.stringify(game.world)).toBe(state);
  });
  it('rejects a second authority and never skips elapsed time during bounded recovery', () => {
    const t = Date.UTC(2026, 10, 3, 14, 59, 58), { game, path } = open(t);
    expect(() => new GameService(path, t)).toThrow(/Another world authority/);
    const token = game.createSession();
    game.pump(t + 5000, 2); expect(game.world.lastReal).toBe(t + 2000);
    expect(() => game.command(token, 'request-adopt-wait', { type: 'adopt', id: 1 }, t + 5000)).toThrow(/catching up/);
    game.pump(t + 5000, 2); game.pump(t + 5000, 2);
    expect(game.world.tick).toBe(5); expect(game.world.lastReal).toBe(t + 5000);
    expect(game.world.eventHistory[0].id).toBe('EV-20261103-09');
  });
  it('runs the persistent scheduler without a client or browser', async () => {
    vi.useFakeTimers(); vi.setSystemTime(Date.UTC(2026, 10, 3, 10));
    const { game, path } = open(); game.start(1000);
    await vi.advanceTimersByTimeAsync(3000);
    expect(game.world.tick).toBe(3); const last = game.world.lastReal;
    close(game); const { game: restarted } = open(last, path);
    expect(restarted.world.tick).toBe(3);
  });
});

describe('shared decision HTTP API', () => {
  it('supports two sessions, CORS, validation and truthful failures', async () => {
    const { game } = open(); const server = gameServer(game, ['http://localhost:4173']);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(server.address() as {port:number}).port}`;
    const post = (path: string, value: unknown, token = '') => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(value) });
    try {
      expect((await fetch(base + '/health')).status).toBe(200);
      expect((await fetch(base + '/state')).status).toBe(401);
      expect((await fetch(base + '/health', { headers: { Origin: 'https://untrusted.invalid' } })).status).toBe(403);
      const preflight = await fetch(base + '/command', { method: 'OPTIONS', headers: { Origin: 'http://localhost:4173' } });
      expect(preflight.headers.get('access-control-allow-origin')).toBe('http://localhost:4173');
      const a = (await (await post('/session', {})).json()).token, b = (await (await post('/session', {})).json()).token;
      expect((await post('/command', { requestId: 'request-adopt-1', command: { type: 'adopt', id: 1 } }, a)).status).toBe(200);
      expect((await post('/command', { requestId: 'request-adopt-1', command: { type: 'adopt', id: 1 } }, b)).status).toBe(409);
      expect((await post('/command', { requestId: 'request-bad-id', command: { type: 'adopt', id: 0 } }, b)).status).toBe(400);
      const state = await (await fetch(base + '/state', { headers: { Authorization: `Bearer ${b}` } })).json();
      expect(state.world.adopted).toEqual([]); expect(state.world.claimed).toEqual([1]);
      expect(JSON.stringify(state)).not.toContain(a);
      expect((await fetch(base + '/chronicle', { headers: { Authorization: `Bearer ${b}` } })).status).toBe(200);
    } finally { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
  });
});
