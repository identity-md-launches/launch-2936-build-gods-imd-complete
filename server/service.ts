import { createRequire } from 'node:module';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { advance, newWorld, type World } from '../src/sim/sim';
import { applyCommand, validCommand, type Command } from '../src/sim/protocol';

const digest = (s: string) => createHash('sha256').update(s).digest('hex');
// createRequire also supports test runners whose builtin list predates Node's SQLite module.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }

/** One leased authority per SQLite database. All changes and evidence commit atomically. */
export class GameService {
  readonly db: import('node:sqlite').DatabaseSync;
  world: World;
  revision = 0;
  private lease = randomBytes(32).toString('hex');
  private timer?: ReturnType<typeof setTimeout>;
  private savedChronicle = 0;
  private savedHistory: number[] = [];
  private savedEvents = new Set<string>();
  private stopped = false;
  failure: string | null = null;

  constructor(path: string, now = Date.now()) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
    this.db.exec('PRAGMA busy_timeout = 5000');
    try {
      this.transaction(() => {
        const active = this.db.prepare('SELECT expires_at FROM authority WHERE id=1').get() as { expires_at: number } | undefined;
        if (active && active.expires_at > Date.now()) throw new Error('Another world authority holds this database.');
        this.db.prepare('INSERT INTO authority VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET token=excluded.token, expires_at=excluded.expires_at').run(this.lease, Date.now() + 30000);
      });
      const row = this.db.prepare('SELECT revision,state_json FROM world WHERE id=1').get() as { revision: number; state_json: string } | undefined;
      this.world = row ? JSON.parse(row.state_json) : newWorld(now);
      this.world.eventHistory ??= [];
      this.revision = row?.revision ?? 0;
      this.savedChronicle = Number(this.db.prepare('SELECT COUNT(*) AS n FROM chronicle').get()!.n);
      this.savedHistory = this.world.agents.map(a => Number(this.db.prepare('SELECT COUNT(*) AS n FROM character_history WHERE agent_id=?').get(a.id)!.n));
      this.savedEvents = new Set((this.db.prepare('SELECT event_id FROM event_history').all() as {event_id:string}[]).map(e=>e.event_id));
      this.persist();
    } catch (error) { this.db.close(); throw error; }
  }

  private transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  private assertLease() {
    const row = this.db.prepare('SELECT token FROM authority WHERE id=1').get();
    if (row?.token !== this.lease) throw new Error('World authority lease lost; stop this process.');
    this.db.prepare('UPDATE authority SET expires_at=? WHERE id=1 AND token=?').run(Date.now() + 30000, this.lease);
  }

  private writeState() {
    this.assertLease();
    const w = this.world;
    const chron = this.db.prepare('INSERT INTO chronicle VALUES(?,?,?,?)');
    for (let i = this.savedChronicle; i < w.chronicle.length; i++) {
      const c = w.chronicle[w.chronicle.length - 1 - i];
      chron.run(i + 1, c.kind, c.at, JSON.stringify(c));
    }
    const hist = this.db.prepare('INSERT INTO character_history VALUES(?,?,?)');
    for (const a of w.agents) for (let i = this.savedHistory[a.id - 1] ?? 0; i < a.history.length; i++) hist.run(a.id, i + 1, a.history[a.history.length - 1 - i]);
    const event = this.db.prepare('INSERT INTO event_history VALUES(?,?)');
    for (const e of w.eventHistory) if (!this.savedEvents.has(e.id)) event.run(e.id, JSON.stringify(e));
    this.db.prepare('INSERT INTO world VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,state_json=excluded.state_json').run(this.revision + 1, JSON.stringify(w));
  }

  private committed() {
    this.revision++;
    this.savedChronicle = this.world.chronicle.length;
    this.savedHistory = this.world.agents.map(a => a.history.length);
    this.savedEvents = new Set(this.world.eventHistory.map(e => e.id));
  }

  private persist() { this.transaction(() => this.writeState()); this.committed(); }

  pump(now = Date.now(), cap = 60) {
    if (this.failure) throw new Error(this.failure);
    const before = structuredClone(this.world);
    try { const ticks = advance(this.world, now, cap); this.persist(); return ticks; }
    catch (error) { this.world = before; this.failure = 'Simulation persistence failed. Operator recovery is required.'; throw error; }
  }

  start(interval = 1000) {
    if (this.timer || this.stopped) return;
    const loop = () => {
      if (this.stopped) return;
      try { this.pump(); }
      catch { this.failure = 'Simulation persistence failed. Operator recovery is required.'; return; }
      this.timer = setTimeout(loop, Date.now() - this.world.lastReal >= 1000 ? 0 : interval);
    };
    this.timer = setTimeout(loop, interval);
  }

  createSession() {
    const token = randomBytes(32).toString('hex');
    this.db.prepare('INSERT INTO sessions VALUES(?,?)').run(digest(token), Date.now());
    return token;
  }

  authenticate(token: string) {
    if (!/^[a-f0-9]{64}$/.test(token)) throw new ApiError(401, 'Join the shared world to create a session.');
    const hash = digest(token);
    if (!this.db.prepare('SELECT 1 FROM sessions WHERE token_hash=?').get(hash)) throw new ApiError(401, 'This session is unknown. Reconnect to join again.');
    return hash;
  }

  snapshot(token: string) {
    const hash = this.authenticate(token);
    const w = structuredClone(this.world);
    w.adopted = (this.db.prepare('SELECT agent_id FROM adoption WHERE session_hash=? ORDER BY agent_id').all(hash) as {agent_id:number}[]).map(r=>r.agent_id);
    w.claimed = (this.db.prepare('SELECT agent_id FROM adoption ORDER BY agent_id').all() as {agent_id:number}[]).map(r=>r.agent_id);
    return { world: w, revision: this.revision, recovering: Date.now() - w.lastReal >= 2000, serverTime: Date.now() };
  }

  command(token: string, requestId: string, c: Command, now = Date.now()) {
    const hash = this.authenticate(token);
    if (!validCommand(c) || !/^[\w-]{8,80}$/.test(requestId)) throw new ApiError(400, 'Invalid command or request ID.');
    if (this.failure) throw new ApiError(503, this.failure);
    if (now - this.world.lastReal >= 2000) throw new ApiError(503, 'The world is catching up. Please retry when recovery finishes.');
    const commandJson = JSON.stringify(c);
    const before = structuredClone(this.world);
    let replay = false;
    try {
      const message = this.transaction(() => {
        this.assertLease();
        const prior = this.db.prepare('SELECT command_json,message FROM command_replies WHERE session_hash=? AND request_id=?').get(hash, requestId);
        if (prior) { if (prior.command_json !== commandJson) throw new ApiError(409, 'This request ID was used for another command.'); replay = true; return String(prior.message); }
        const owner = this.db.prepare('SELECT session_hash FROM adoption WHERE agent_id=?').get(c.id);
        if (c.type === 'adopt') {
          if (owner && owner.session_hash !== hash) throw new ApiError(409, 'Another player already guides this inhabitant. Choose someone else.');
          const count = Number(this.db.prepare('SELECT COUNT(*) AS n FROM adoption WHERE session_hash=?').get(hash)!.n);
          if (!owner && count >= 3) throw new ApiError(409, 'You can guide up to 3 inhabitants. Release one first.');
        } else if (owner?.session_hash !== hash) throw new ApiError(403, 'Only the player guiding this inhabitant can give orders.');
        this.world.adopted = (this.db.prepare('SELECT agent_id FROM adoption WHERE session_hash=?').all(hash) as {agent_id:number}[]).map(r=>r.agent_id);
        const message = applyCommand(this.world, c, now);
        if (c.type === 'adopt') this.db.prepare('INSERT INTO adoption VALUES(?,?) ON CONFLICT(agent_id) DO NOTHING').run(c.id, hash);
        if (c.type === 'release') this.db.prepare('DELETE FROM adoption WHERE agent_id=? AND session_hash=?').run(c.id, hash);
        this.world.adopted = (this.db.prepare('SELECT agent_id FROM adoption').all() as {agent_id:number}[]).map(r=>r.agent_id);
        this.db.prepare('INSERT INTO command_replies VALUES(?,?,?,?,?)').run(hash, requestId, commandJson, message, now);
        this.writeState();
        return message;
      });
      if (!replay) this.committed();
      return { message, ...this.snapshot(token) };
    } catch (error) { this.world = before; throw error; }
  }

  records(kind: string | null, before: number, limit = 100) {
    const rows = kind ? this.db.prepare('SELECT sequence,record_json FROM chronicle WHERE kind=? AND sequence<? ORDER BY sequence DESC LIMIT ?').all(kind, before, limit) : this.db.prepare('SELECT sequence,record_json FROM chronicle WHERE sequence<? ORDER BY sequence DESC LIMIT ?').all(before, limit);
    return rows.map(row=>({ sequence: Number(row.sequence), ...JSON.parse(String(row.record_json)) }));
  }

  close() {
    this.stopped = true; clearTimeout(this.timer);
    this.db.prepare('DELETE FROM authority WHERE id=1 AND token=?').run(this.lease);
    this.db.close();
  }
}
