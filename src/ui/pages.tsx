import { Fragment, useEffect, useMemo, useState } from 'react';
import { useWorld } from './useWorld';
import { FACTIONS, FACTION_INFO, RARITIES, type Faction } from '../sim/genesis';
import { G, marketQuote, PRIORITIES, RESOURCES, summary, type Agent, type Res } from '../sim/sim';
import { connect, connection, execute, reset, useLocalWorld } from '../sim/store';
import { checksum, duel, EVENT_INFO, eventsAround, maxHp, power, rank, seasonAt } from '../sim/rules';
import { LOC, LOCATIONS } from '../sim/world';
import { ACT_LABEL, activity, FactionTag, fmtDur, fmtUtc, gname, Meter, Portrait } from './common';
import { fighter } from '../sim/sim';

const PAGE = 48;

function CharacterHistory({ agent }: { agent: Agent }) {
  const [shown, setShown] = useState(40);
  return <>
    {agent.history.length === 0 ? <p className="empty">Nothing recorded yet.</p> : <ul className="feed">{agent.history.slice(0, shown).map((h, i) => <li key={i}>{h}</li>)}</ul>}
    {shown < agent.history.length && <button className="btn" type="button" onClick={() => setShown(shown + 40)}>Show older history</button>}
  </>;
}

export function InhabitantsPage() {
  const w = useWorld();
  const [q, setQ] = useState('');
  const [fac, setFac] = useState(() => { try { const f = sessionStorage.getItem('f'); sessionStorage.removeItem('f'); return FACTIONS.includes(f as Faction) ? f! : 'all'; } catch { return 'all'; } });
  const [rar, setRar] = useState('all');
  const [st, setSt] = useState('all');
  const [sort, setSort] = useState('id');
  const [n, setN] = useState(PAGE);
  const list = useMemo(() => {
    const qq = q.trim().toLowerCase();
    let l = w.agents.filter((a) => {
      const g = G()[a.id - 1];
      if (fac !== 'all' && g.faction !== fac) return false;
      if (rar !== 'all' && g.rarity !== rar) return false;
      if (st === 'alive' && !a.alive) return false;
      if (st === 'fallen' && a.alive) return false;
      if (st === 'sick' && !a.infected) return false;
      if (st === 'mine' && !w.adopted.includes(a.id)) return false;
      return !qq || g.name.toLowerCase().includes(qq) || String(a.id) === qq || g.role.toLowerCase().includes(qq);
    });
    if (sort === 'level') l = [...l].sort((x, y) => y.level - x.level || x.id - y.id);
    if (sort === 'score') l = rank(l);
    return l;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, fac, rar, st, sort, w.tick]);
  useEffect(() => setN(PAGE), [q, fac, rar, st, sort]);
  return (
    <div className="page">
      <h1>Inhabitants</h1>
      <p className="lede">All 1,000 Genesis characters. Each one keeps its own needs, skills, friends and history.</p>
      <form className="filters" onSubmit={(e) => e.preventDefault()} role="search">
        <label>Search<input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, role or token id" /></label>
        <label>Faction<select value={fac} onChange={(e) => setFac(e.target.value)}><option value="all">All factions</option>{FACTIONS.map((f) => <option key={f}>{f}</option>)}</select></label>
        <label>Rarity<select value={rar} onChange={(e) => setRar(e.target.value)}><option value="all">All rarities</option>{RARITIES.map((f) => <option key={f}>{f}</option>)}</select></label>
        <label>Status<select value={st} onChange={(e) => setSt(e.target.value)}><option value="all">Everyone</option><option value="alive">Living</option><option value="sick">Infected</option><option value="fallen">Fallen</option><option value="mine">Adopted by you</option></select></label>
        <label>Sort<select value={sort} onChange={(e) => setSort(e.target.value)}><option value="id">Token id</option><option value="level">Level</option><option value="score">Season score</option></select></label>
      </form>
      <p className="muted" aria-live="polite">{list.length} of 1,000 shown</p>
      {list.length === 0 ? <p className="empty">Nobody matches these filters. Clear the search or pick another faction.</p> : (
        <ul className="cards">
          {list.slice(0, n).map((a) => { const g = G()[a.id - 1]; return (
            <li key={a.id} className="card person">
              <Portrait id={a.id} size={56} />
              <div>
                <a className="title" href={`#/inhabitant/${a.id}`}>{g.name}</a>
                <p className="muted">#{a.id} <FactionTag f={g.faction} /> {g.rarity}</p>
                <p className="muted">Level {a.level}, {activity(a).toLowerCase()}</p>
              </div>
            </li>
          ); })}
        </ul>
      )}
      {n < list.length && <button type="button" className="btn" onClick={() => setN(n + PAGE)}>Show {Math.min(PAGE, list.length - n)} more</button>}
    </div>
  );
}

export function ProfilePage({ id }: { id: number }) {
  const w = useWorld();
  const [result, setResult] = useState<string | null>(null);
  const [prio, setPrio] = useState('gather');
  const [dest, setDest] = useState('market');
  const [foe, setFoe] = useState('');
  if (!Number.isInteger(id) || id < 1 || id > 1000) return <div className="page"><h1>No such inhabitant</h1><p>Token ids run from 1 to 1,000. <a href="#/inhabitants">Browse inhabitants</a></p></div>;
  const a = w.agents[id - 1];
  const g = G()[id - 1];
  const mine = w.adopted.includes(id);
  const run = async (kind: 'priority' | 'goto' | 'duel' | 'stance', arg: string) => {
    try { setResult(await execute({ type: 'decision', id, kind, arg })); }
    catch (error) { setResult((error as Error).message); }
  };
  const ownership = async (type: 'adopt' | 'release') => { try { setResult(await execute({ type, id })); } catch (error) { setResult((error as Error).message); } };
  const rels = Object.entries(a.rel).sort((x, y) => y[1] - x[1]);
  const decisions = w.decisions.filter((d) => d.agent === id);
  return (
    <div className="page profile">
      <div className="pick-head">
        <Portrait id={id} size={120} />
        <div>
          <h1>{g.name}</h1>
          <p className="muted">Genesis #{id} <FactionTag f={g.faction} /> {g.rarity} {g.role.toLowerCase()}</p>
          <p>{a.alive ? `${activity(a)} at ${LOC[a.loc].name}.` : `Fell to ${a.died?.cause} on ${fmtUtc(a.died!.at)}. This memorial keeps their identity and history.`}{a.infected ? ' Infected with the plague.' : ''}</p>
          <div className="row">
            {a.alive && (mine
              ? <button type="button" className="btn" disabled={connection.pending} onClick={() => void ownership('release')}>Release</button>
              : <button type="button" className="btn primary" disabled={connection.pending} onClick={() => void ownership('adopt')}>Adopt</button>)}
            {a.alive && <a className="btn" href={`#/?focus=${id}`}>Show on map</a>}
            <a className="btn ghost" href={`./genesis/metadata/${id}.json`}>Metadata</a>
          </div>
          {result && <p className="note" role="status">{result}</p>}
        </div>
      </div>

      {mine && a.alive && (
        <section className="card orders" aria-labelledby="orders">
          <h2 id="orders">Orders</h2>
          <p className="muted">Orders are checked against level, health, energy and coins before they run.</p>
          <div className="order">
            <label>Priority<select value={prio} onChange={(e) => setPrio(e.target.value)}><option value="none">No priority</option>{PRIORITIES.map((p) => <option key={p} value={p}>{ACT_LABEL[p]}</option>)}</select></label>
            <button type="button" className="btn primary" onClick={() => run('priority', prio)}>Set priority</button>
          </div>
          <div className="order">
            <label>Destination<select value={dest} onChange={(e) => setDest(e.target.value)}>{LOCATIONS.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
            <button type="button" className="btn" onClick={() => run('goto', dest)}>Send</button>
          </div>
          <div className="order">
            <label>Rival token id<input inputMode="numeric" pattern="[0-9]*" value={foe} onChange={(e) => setFoe(e.target.value.replace(/\D/g, ''))} placeholder="e.g. 42" /></label>
            <button type="button" className="btn" disabled={!foe} onClick={() => run('duel', foe)}>Challenge to duel</button>
          </div>
          <p className="muted">{LOC[dest].purpose} A duel costs 5 coins.</p>
        </section>
      )}

      <div className="grid2">
        <section className="card"><h2>Needs</h2>
          <Meter label="Health" value={a.health} /><Meter label="Food" value={a.food} /><Meter label="Energy" value={a.energy} /><Meter label="Mood" value={a.mood} />
        </section>
        <section className="card"><h2>Progress</h2>
          <dl className="kv">
            <dt>Level</dt><dd>{a.level} ({Math.round(a.xp)} xp)</dd>
            <dt>Season score</dt><dd>{Math.round(a.score)}</dd>
            <dt>Duels</dt><dd>{a.wins} won, {a.losses} lost</dd>
            <dt>Discoveries</dt><dd>{a.discoveries}</dd>
            <dt>Gear</dt><dd>Weapon {a.weapon}, armor {a.armor}</dd>
            <dt>Coins</dt><dd>{a.coins.toFixed(1)}</dd>
            <dt>Carrying</dt><dd>{a.inv.food} food, {a.inv.wood} wood, {a.inv.ore} ore, {a.inv.herbs} herbs</dd>
          </dl>
        </section>
        <section className="card"><h2>Skills and attributes</h2>
          <dl className="kv">
            {Object.entries(a.skills).map(([k, v]) => <Fragment key={k}><dt>{k[0].toUpperCase() + k.slice(1)}</dt><dd>{v.toFixed(1)}</dd></Fragment>)}
            {Object.entries(g.attrs).map(([k, v]) => <Fragment key={k}><dt>{k.toUpperCase()}</dt><dd>{v}</dd></Fragment>)}
          </dl>
        </section>
        <section className="card"><h2>Personality</h2>
          {Object.entries(g.traits).map(([k, v]) => <Meter key={k} label={k[0].toUpperCase() + k.slice(1)} value={v * 100} />)}
        </section>
        <section className="card"><h2>Relationships</h2>
          {rels.length === 0 ? <p className="empty">No bonds yet. Bonds form when inhabitants socialize or fight.</p> : (
            <ul className="mini">{rels.map(([rid, v]) => <li key={rid}><a href={`#/inhabitant/${rid}`}>{gname(+rid)}</a><span className="muted">{v >= 20 ? 'Close friend' : v > 0 ? 'Friendly' : v <= -8 ? 'Rival' : 'Wary'} ({v})</span></li>)}</ul>
          )}
        </section>
        <section className="card"><h2>History</h2>
          <CharacterHistory key={id} agent={a} />
          {a.achievements.length > 0 && <p>Achievements: {a.achievements.join(', ')}</p>}
        </section>
      </div>
      {decisions.length > 0 && (
        <section className="card"><h2>Decision history</h2>
          <table className="tbl"><thead><tr><th>Order</th><th>Status</th><th>Response</th><th>Cost</th><th>Time</th></tr></thead>
            <tbody>{decisions.map((d) => <tr key={d.id}><td>{d.text}</td><td>{d.status}</td><td>{d.reason}</td><td>{d.cost}</td><td>{fmtUtc(d.at)}</td></tr>)}</tbody></table>
        </section>
      )}
    </div>
  );
}

export function FactionsPage() {
  const w = useWorld();
  const s = summary(w);
  return (
    <div className="page">
      <h1>Factions</h1>
      <p className="lede">Four halls, 250 Genesis inhabitants each at the start. Stockpiles grow when members sell at the Grand Market.</p>
      <div className="grid2">
        {FACTIONS.map((f) => { const p = s.per[f]; const st = w.stock[f]; const held = Object.entries(w.control).filter(([, c]) => c === f).map(([t]) => LOC[t].name); return (
          <section key={f} className="card faction" style={{ borderInlineStartColor: FACTION_INFO[f].color }}>
            <h2><FactionTag f={f} /></h2>
            <p>{FACTION_INFO[f].focus}. {FACTION_INFO[f].motto}</p>
            <dl className="kv">
              <dt>Living</dt><dd>{p.alive}</dd><dt>Fallen</dt><dd>{p.fallen}</dd>
              <dt>Average level</dt><dd>{(p.level / 250).toFixed(2)}</dd>
              <dt>Season score</dt><dd>{Math.round(p.score + w.renown[f])}</dd>
              <dt>Stockpile</dt><dd>{st.food} food, {st.wood} wood, {st.ore} ore, {st.herbs} herbs</dd>
              <dt>Territories</dt><dd>{held.length ? held.join(', ') : 'None held'}</dd>
              <dt>Event stance</dt><dd>{w.event ? (w.event.stance[f] === 'cooperate' ? 'Cooperating' : 'Competing') : 'No event'}</dd>
            </dl>
            <a href="#/inhabitants" onClick={() => { try { sessionStorage.setItem('f', f); } catch { /* Optional filter; directory still opens when storage is denied. */ } }}>Browse {f} members</a>
          </section>
        ); })}
      </div>
    </div>
  );
}

function Replay({ id }: { id: string }) {
  const w = useWorld();
  const d = w.duels.find((x) => x.duelId === id);
  const [shown, setShown] = useState(1);
  useEffect(() => { setShown(1); }, [id]);
  useEffect(() => {
    if (!d || shown >= d.rounds.length) return;
    const t = setTimeout(() => setShown((s) => s + 1), 900);
    return () => clearTimeout(t);
  }, [d, shown]);
  if (!d) return <p className="empty">No duel with this id is recorded. Choose a duel from the arena list.</p>;
  const ga = G()[d.a - 1], gb = G()[d.b - 1];
  const fa = fighter(w.agents[d.a - 1]), fb = fighter(w.agents[d.b - 1]);
  return (
    <section className="card" aria-labelledby="replay">
      <h2 id="replay">Spectating {d.duelId}</h2>
      <p>{ga.name} against {gb.name}. Winner: <strong>{gname(d.winner)}</strong> by {d.reason}.</p>
      <table className="tbl"><thead><tr><th>Round</th><th>{ga.name.split(' ')[0]} hits</th><th>{gb.name.split(' ')[0]} hits</th><th>HP left</th></tr></thead>
        <tbody>{d.rounds.slice(0, shown).map((r) => <tr key={r.round}><td>{r.round}</td><td>{r.aHit}</td><td>{r.bHit}</td><td>{r.aHp} to {r.bHp}</td></tr>)}</tbody></table>
      <div className="row">
        <button type="button" className="btn" onClick={() => setShown(d.rounds.length)} disabled={shown >= d.rounds.length}>Show all rounds</button>
        <button type="button" className="btn ghost" onClick={() => setShown(1)}>Replay</button>
      </div>
      <p className="muted">Recheck with current stats (gear and level may have changed since): {gname(duel(d.duelId, fa, fb).winner)} would win.</p>
    </section>
  );
}

export function ArenaPage({ duelId }: { duelId?: string }) {
  const w = useWorld();
  const champs = [...w.agents].filter((a) => a.wins > 0).sort((x, y) => y.wins - x.wins || x.losses - y.losses || x.id - y.id).slice(0, 10);
  return (
    <div className="page">
      <h1>Arena of Ash</h1>
      <p className="lede">Duels, territory battles and raids follow the published rules below. No one picks winners.</p>
      {duelId && <Replay id={duelId} />}
      <div className="grid2">
        <section className="card"><h2>Recent duels</h2>
          {w.duels.length === 0 ? <p className="empty">No duels yet. Brave inhabitants of level 2 and up seek the arena, or challenge someone from a profile.</p> : (
            <ul className="feed">{w.duels.slice(0, 12).map((d) => <li key={d.duelId}><a href={`#/arena/${d.duelId}`}>{gname(d.winner)} beat {gname(d.loser)}</a> <span className="muted">{d.rounds.length} rounds</span></li>)}</ul>
          )}
        </section>
        <section className="card"><h2>Champions this season</h2>
          {champs.length === 0 ? <p className="empty">No wins recorded this season.</p> : (
            <ol className="mini">{champs.map((a) => <li key={a.id}><a href={`#/inhabitant/${a.id}`}>{gname(a.id)}</a><span className="muted">{a.wins} to {a.losses}</span></li>)}</ol>
          )}
        </section>
        <section className="card"><h2>Territory control</h2>
          <table className="tbl"><thead><tr><th>Territory</th><th>Held by</th>{FACTIONS.map((f) => <th key={f}>{f}</th>)}</tr></thead>
            <tbody>{Object.keys(w.control).map((t) => <tr key={t}><td>{LOC[t].name}</td><td>{w.control[t] ?? 'Nobody'}</td>{FACTIONS.map((f) => <td key={f} className="num">{Math.round(w.influence[t][f])}</td>)}</tr>)}</tbody></table>
          <p className="muted">Patrols add influence; influence decays 3% every 30 seconds. Control needs more than 20 and the lead.</p>
        </section>
        <section className="card"><h2>World boss: the Ashen Wyrm</h2>
          <Meter label="Wyrm HP" value={w.boss.hp} max={w.boss.max} />
          <p>Slain {w.boss.defeats} times. Raiders need level 5 and must be at least 3 at Ashen Crag to strike. Each strike deals power divided by 10.</p>
        </section>
      </div>
      <section className="card"><h2>Duel rules</h2>
        <p>Power = 10 + 1.2 STR + 0.8 AGI + 0.6 VIT + 2 combat skill + 3 level + 6 weapon + 4 armor. HP = 30 + 2 VIT + 2 level.</p>
        <p>Up to 7 rounds. Each side hits for power times a roll from 0.75 to 1.25, divided by 8, minus the other side's armor, at least 1. First to 0 HP loses. After 7 rounds the higher share of HP left wins; an exact tie goes to the lower token id. The rolls are seeded by the duel id alone, so every replay matches.</p>
        <p className="muted">Example: a fresh #1 against #2 has power {power(fighter(w.agents[0])).toFixed(0)} against {power(fighter(w.agents[1])).toFixed(0)}, HP {maxHp(fighter(w.agents[0]))} against {maxHp(fighter(w.agents[1]))}.</p>
      </section>
    </div>
  );
}

export function EventsPage() {
  const w = useWorld();
  const now = Date.now();
  const sched = eventsAround(now, 3, 6);
  const ev = w.event;
  const s = summary(w);
  const mine = w.adopted.find((id) => w.agents[id - 1].alive);
  const [msg, setMsg] = useState<string | null>(null);
  const [judgmentsShown, setJudgmentsShown] = useState(10);
  const settled = w.eventHistory ?? [];
  const stance = async (arg: 'cooperate' | 'compete') => { if (mine) try { setMsg(await execute({ type: 'decision', id: mine, kind: 'stance', arg })); } catch (error) { setMsg((error as Error).message); } };
  return (
    <div className="page">
      <h1>World events</h1>
      <p className="lede">A new event begins at 09:00, 15:00 and 21:00 UTC and runs until the next one. The Black Plague returns every third evening.</p>
      {ev && (
        <section className="card" aria-labelledby="ev-now">
          <h2 id="ev-now">{ev.kind} <span className="muted">{ev.id}</span></h2>
          <p>{EVENT_INFO[ev.kind].effect}</p>
          <p className="muted">From {fmtUtc(ev.start)} to {fmtUtc(ev.end)}, {fmtDur(ev.end - now)} left. Success: {EVENT_INFO[ev.kind].success}.</p>
          <Meter label="Progress" value={ev.kind === 'Black Plague' ? w.cureResearch : (ev.progress / ev.target) * 100} />
          {ev.kind === 'Black Plague' && <p>{s.infected} inhabitants are infected. Cure research: {w.cureResearch.toFixed(1)} of 100. Herbs sell for {w.prices.herbs.toFixed(2)} coins.</p>}
          {ev.kind === 'Monster Invasion' && <p>{w.monsters} monsters remain at the frontier.</p>}
          {ev.kind === 'Faction Challenge' && <p>Gathered: {FACTIONS.map((f) => `${f} ${ev.tally[f]}`).join(', ')}. A champion must gather more than 50 resources; ties break in order: Ironborn, Wilds, Veil, Crown. Only a qualifying champion receives 50 renown.</p>}
          <h3 className="h3">Your faction's stance</h3>
          {mine ? (
            <div className="row">
              <button type="button" className="btn" aria-pressed={ev.stance[G()[mine - 1].faction] === 'cooperate'} onClick={() => void stance('cooperate')}>Cooperate</button>
              <button type="button" className="btn" aria-pressed={ev.stance[G()[mine - 1].faction] === 'compete'} onClick={() => void stance('compete')}>Compete</button>
            </div>
          ) : <p className="empty">Adopt a living inhabitant to vote for their faction. <a href="#/">Go to the world</a></p>}
          {msg && <p className="note" role="status">{msg}</p>}
          <p className="muted">Cooperating factions send their herb stockpile to the cure. Competing ones keep it.</p>
        </section>
      )}
      <section className="card"><h2>Schedule</h2>
        <table className="tbl"><thead><tr><th>Event id</th><th>Event</th><th>Starts</th><th>State</th></tr></thead>
          <tbody>{sched.map((e) => <tr key={e.id}><td className="num">{e.id}</td><td>{e.kind}</td><td>{fmtUtc(e.start)}</td><td>{e.end <= now ? (w.executed.includes(`${e.id}:settled`) ? 'Judged' : 'Passed while closed') : e.start <= now ? 'Running' : 'Upcoming'}</td></tr>)}</tbody></table>
        <p className="muted">Each event id runs once: the world keeps a list of executed ids, so reopening the page never starts the same event twice.</p>
      </section>
      <section className="card"><h2>Oracle judgments</h2>
        <p>No official IMD Oracle endpoint is connected to this static build. Every outcome uses the published fallback rule: success if progress reaches the event's target, otherwise failure. The inputs are recorded with the result.</p>
        {settled.length === 0 ? <p className="empty">No event evidence has been recorded in this world yet. The first judgment appears when the current event ends.</p> : settled.slice(0, judgmentsShown).map((e) => <details className="oracle-record" key={e.id}><summary>{e.id}: {e.oracle?.result} · {fmtUtc(e.oracle?.at ?? e.end)}</summary><pre className="code">{JSON.stringify(e.oracle, null, 2)}</pre></details>)}
        {judgmentsShown < settled.length && <button type="button" className="btn" onClick={() => setJudgmentsShown(judgmentsShown + 10)}>Show older judgments</button>}
      </section>
    </div>
  );
}

export function SeasonPage() {
  const w = useWorld();
  const now = Date.now();
  const s = seasonAt(now);
  const top = rank(w.agents).slice(0, 25);
  const fs = FACTIONS.map((f) => [f, Math.round(w.agents.filter((a) => G()[a.id - 1].faction === f).reduce((t, a) => t + a.score, 0) + w.renown[f])] as [Faction, number]).sort((a, b) => b[1] - a[1]);
  return (
    <div className="page">
      <h1>Season {s.n}</h1>
      <p className="lede">Seasons last exactly 15 days in UTC. This one runs from {fmtUtc(s.start)} to {fmtUtc(s.end)}, {fmtDur(s.end - now)} left.</p>
      <div className="grid2">
        <section className="card"><h2>Leaderboard</h2>
          <table className="tbl"><thead><tr><th>Rank</th><th>Inhabitant</th><th>Score</th><th>Level</th></tr></thead>
            <tbody>{top.map((a, i) => <tr key={a.id}><td className="num">{i + 1}</td><td><a href={`#/inhabitant/${a.id}`}>{gname(a.id)}</a></td><td className="num">{Math.round(a.score)}</td><td className="num">{a.level}</td></tr>)}</tbody></table>
          <p className="muted">Ties break by level, then by the lower token id. Score comes from experience, duel wins, discoveries and achievements.</p>
        </section>
        <section className="card"><h2>Faction standings</h2>
          <ol className="mini">{fs.map(([f, v]) => <li key={f}><FactionTag f={f} /><span className="num">{v}</span></li>)}</ol>
          <h3 className="h3">Prize accounting</h3>
          <p>No prize pool exists: no economy contract is deployed and no IMD has been paid in. Nothing is owed and nothing can be claimed.</p>
          <p className="muted">Settlement fingerprint of the current standings: {checksum(JSON.stringify(top.map((a) => [a.id, Math.round(a.score)])))}</p>
        </section>
      </div>
      <section className="card"><h2>Archive</h2>
        {w.archive.length === 0 ? <p className="empty">No season has closed on this device yet. When one ends, its final top 10, faction totals and fingerprint are stored here.</p> : (
          <ul className="feed">{w.archive.map((r) => <li key={r.id}>{r.id}: {gname(r.top[0].id)} first, fingerprint {r.checksum}. {r.prize}</li>)}</ul>
        )}
      </section>
    </div>
  );
}

export function ChroniclePage() {
  const w = useWorld();
  const kinds = Array.from(new Set(w.chronicle.map((c) => c.kind)));
  const [k, setK] = useState('all');
  const [shown, setShown] = useState(100);
  const list = w.chronicle.filter((c) => k === 'all' || c.kind === k);
  return (
    <div className="page">
      <h1>Chronicle</h1>
      <p className="lede">The permanent record of this world: events, judgments, duels, discoveries and the fallen.</p>
      <label className="inline">Show<select value={k} onChange={(e) => { setK(e.target.value); setShown(100); }}><option value="all">Everything</option>{kinds.map((x) => <option key={x} value={x}>{x[0].toUpperCase() + x.slice(1)}</option>)}</select></label>
      <p className="muted">Showing {Math.min(shown, list.length)} of {list.length} records.</p>
      {list.length === 0 ? <p className="empty">Nothing of this kind has happened yet.</p> : (
        <ul className="feed chronicle">{list.slice(0, shown).map((c, i) => <li key={i}><span className="muted num">{fmtUtc(c.at)}</span> {c.ref ? <a href={c.ref}>{c.text}</a> : c.text}</li>)}</ul>
      )}
      {shown < list.length && <button type="button" className="btn" onClick={() => setShown(shown + 100)}>Show older records</button>}
    </div>
  );
}

export function MarketplacePage() {
  const w = useWorld();
  const [id, setId] = useState(String(w.adopted[0] ?? ''));
  const [resource, setResource] = useState<Res>('food');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [quantity, setQuantity] = useState('1');
  const [message, setMessage] = useState('');
  const a = w.adopted.includes(Number(id)) ? w.agents[Number(id) - 1] : null;
  const faction = a ? G()[a.id - 1].faction : null;
  const total = a ? marketQuote(w, a.id, resource, side) * Number(quantity) : 0;
  const run = async (send = false) => {
    if (!a) return;
    try { setMessage(await execute(send ? { type: 'decision', id: a.id, kind: 'goto', arg: 'market' } : { type: 'trade', id: a.id, resource, side, quantity: Number(quantity) })); }
    catch (error) { setMessage((error as Error).message); }
  };
  return <div className="page">
    <h1>Grand Marketplace</h1>
    <p className="lede">Buy supplies and sell gathered goods with your inhabitant's coins. Prices and faction stockpiles come from this world.</p>
    <section className="card" aria-labelledby="market-trade">
      <h2 id="market-trade">Trade goods</h2>
      {w.adopted.length === 0 ? <p className="empty">Adopt an inhabitant to use their inventory and coins. <a className="btn primary" href="#/inhabitants">Choose an inhabitant</a></p> : <form className="calc" onSubmit={(e) => { e.preventDefault(); void run(); }}>
        <label>Inhabitant<select value={id} onChange={(e) => { setId(e.target.value); setMessage(''); }}>{!a && <option value="">Choose an inhabitant</option>}{w.adopted.map(n => <option value={n} key={n}>#{n} {gname(n)}</option>)}</select></label>
        {a && <>
          <p className="market-summary">{a.alive ? `${a.arrived ? 'At' : 'Travelling to'} ${LOC[a.loc].name}` : 'Fallen · memorial'}. Coins: {a.coins.toFixed(2)}. Carrying: {RESOURCES.map(r => `${a.inv[r]} ${r}`).join(', ')}.</p>
          {a.alive && (a.loc !== 'market' || !a.arrived) && <div><button type="button" className="btn" disabled={connection.pending} onClick={() => void run(true)}>Send to Grand Market</button><p className="hint">Wait for arrival before trading. A requested visit allows 60 seconds at the market.</p></div>}
        </>}
        <div className="grid2">
          <label>Good<select value={resource} onChange={(e) => { setResource(e.target.value as Res); setMessage(''); }}>{RESOURCES.map(r => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}</select></label>
          <label>Action<select value={side} onChange={(e) => { setSide(e.target.value as 'buy' | 'sell'); setMessage(''); }}><option value="buy">Buy from faction stockpile</option><option value="sell">Sell to faction stockpile</option></select></label>
        </div>
        <label>Quantity (1–100)<input type="number" min="1" max="100" step="1" required value={quantity} onChange={(e) => { setQuantity(e.target.value); setMessage(''); }} /></label>
        <p className="muted">Current quote: {Number.isFinite(total) ? total.toFixed(2) : '—'} coins{faction ? `. ${faction} stock: ${w.stock[faction][resource]} ${resource}` : ''}. The price is checked again when the order runs.</p>
        <div><button type="submit" className="btn primary" disabled={!a || !a.alive || connection.pending || connection.recovering}>{connection.pending ? 'Saving trade…' : side === 'buy' ? 'Buy goods' : 'Sell goods'}</button></div>
      </form>}
      <p role="status" className={message ? 'note' : undefined}>{message}</p>
    </section>
    <section className="card"><h2>World prices and stock</h2>
      <table className="tbl"><thead><tr><th>Good</th><th>Buy / unit</th>{FACTIONS.map(f => <th key={f}>{f} stock</th>)}</tr></thead><tbody>{RESOURCES.map(r => <tr key={r}><th>{r[0].toUpperCase() + r.slice(1)}</th><td>{w.prices[r].toFixed(2)} coins</td>{FACTIONS.map(f => <td key={f}>{w.stock[f][r]}</td>)}</tr>)}</tbody></table>
      <p className="hint">Sell price = world price × 80% × trade skill bonus; Trade Caravan adds 50%. Selling keeps 3 food for survival. Purchases consume your faction's stock. Empty stock means no goods are available; try later or sell supplies.</p>
    </section>
    <section className="card"><h2>NFT and IMD trading</h2><p>On-chain trading is unavailable. No marketplace contract, wallet or payment integration is connected. These trades use simulation coins only.</p></section>
  </div>;
}

function WorldConnection() {
  const [url, setUrl] = useState(connection.apiUrl);
  const [message, setMessage] = useState('');
  return <section className="card"><h2>World connection</h2>
    <p>{connection.mode === 'shared' ? 'Shared play is connected. This world continues on its service when every browser closes.' : connection.mode === 'local' ? 'Local play is active. This device has its own world; it catches up when reopened.' : connection.mode === 'connecting' ? 'Joining the shared world…' : 'The shared world could not be reached.'}</p>
    <p className="muted">An operator must run the supplied world service. Enter its URL to join. Browser sessions reserve inhabitants; adoption is not NFT ownership.</p>
    <form className="calc" onSubmit={(e) => { e.preventDefault(); setMessage(''); void connect(url).then(() => setMessage('Joined the shared world.'), error => setMessage((error as Error).message)); }}>
      <label>World service URL<input type="url" value={url} required onChange={(e) => setUrl(e.target.value)} placeholder="HTTPS URL supplied by the world operator" /></label>
      <div className="row"><button type="submit" className="btn" disabled={connection.mode === 'connecting'}>{connection.mode === 'connecting' ? 'Joining…' : 'Join shared world'}</button>{connection.mode !== 'local' && <button type="button" className="btn ghost" onClick={() => { useLocalWorld(); setMessage('Returned to this device’s local world.'); }}>Use local world</button>}</div>
      <p role="status" className={message ? 'note' : undefined}>{message}</p>
    </form>
  </section>;
}

function BreakEven() {
  const [cost, setCost] = useState('400');
  const [fee, setFee] = useState('2');
  const c = Number(cost), f = Number(fee);
  const ok = c >= 0 && f > 0;
  const actions = ok ? Math.ceil(c / (f * 0.5)) : 0;
  return (
    <form className="calc" onSubmit={(e) => e.preventDefault()}>
      <label>Monthly running cost (USD)<input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} /></label>
      <label>Fee per paid action (USD)<input inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} /></label>
      <p role="status">{ok ? `The creator half covers costs at ${actions.toLocaleString()} paid actions a month (${Math.ceil(actions / 30).toLocaleString()} a day). A 90-day reserve is ${(c * 3).toLocaleString()} USD.` : 'Enter a cost of 0 or more and a fee above 0.'}</p>
    </form>
  );
}

function TalkToDev() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const url = `https://github.com/RobertKodes/gods/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body + '\n\nSent from the Gods of IMD Council page.')}`;
  return (
    <form className="calc" onSubmit={(e) => { e.preventDefault(); if (title.trim()) window.open(url, '_blank', 'noopener'); }}>
      <label>Request title<input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Add a fishing village" /></label>
      <label>What should change<textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="Describe the feature and why holders want it" /></label>
      <button type="submit" className="btn primary" disabled={!title.trim()}>Open request on GitHub</button>
      <p className="muted">This opens a prefilled issue in the project repository. Paid IMD swarm jobs are not wired in: the current IMD job price and payment flow could not be verified for this build, so no price is shown.</p>
    </form>
  );
}

export function CouncilPage() {
  const w = useWorld();
  const [confirm, setConfirm] = useState(false);
  const size = useMemo(() => { try { return (localStorage.getItem('gods-of-imd:world:v1') ?? '').length; } catch { return 0; } }, [w.tick - (w.tick % 10)]);
  return (
    <div className="page">
      <h1>Council</h1>
      <p className="lede">Governance, treasury, requests to the developers and world health. What is not live yet says so.</p>
      <WorldConnection />
      <div className="grid2">
        <section className="card"><h2>Governance</h2>
          <p>No proposals can be opened: no governance contract is deployed, and no Genesis token exists to vote with.</p>
          <p className="muted">Planned rules: holders of Genesis tokens vote on fees, new paid actions, season rules, creator wallet or prize changes and any new token. Changes never apply to a season already running.</p>
        </section>
        <section className="card"><h2>Treasury and economy</h2>
          <p>Balance: none. No IMD has been received, because no paid action exists in this build.</p>
          <p className="muted">Planned split for qualifying paid actions only (arena entry, expedition permits, rebuilding after disasters): 50% to the creator wallet, 50% to the season prize pool. Failed transactions, refunds and infrastructure or Oracle costs are excluded.</p>
          <h3 className="h3">Break-even check</h3>
          <BreakEven />
        </section>
        <section className="card"><h2>Talk to the Dev</h2><TalkToDev /></section>
        <section className="card"><h2>Gods' Workshop observatory</h2>
          <p>No verified IMD swarm feed is connected, so no workers, jobs or reviews are shown. Nothing here is simulated.</p>
          <p className="muted">When a feed is connected, records will be split into online, working, submitted, accepted, completed, reviewed, deployed and verified.</p>
        </section>
        <section className="card"><h2>Genesis collection</h2>
          <p>1,000 portraits and metadata files ship with this site. The collection is not minted. Adoption is a game reservation, saved on this device in local play or by the service in shared play.</p>
          <div className="row"><a className="btn" href="./genesis/manifest.json">Download manifest</a><a className="btn ghost" href="./genesis/images/1.svg">First portrait</a></div>
        </section>
        <section className="card"><h2>World health</h2>
          <dl className="kv"><dt>Ticks simulated</dt><dd>{w.tick.toLocaleString()}</dd><dt>Saved state</dt><dd>{connection.mode === 'local' ? `${(size / 1024).toFixed(0)} KB on this device` : 'Authoritative service database'}</dd><dt>Events executed</dt><dd>{w.executed.filter((x) => !x.endsWith(':settled')).length}</dd><dt>Living</dt><dd>{summary(w).alive}</dd></dl>
          {connection.mode !== 'local' ? <p className="muted">Shared worlds cannot be reset from a browser.</p> : !confirm ? <button type="button" className="btn" onClick={() => setConfirm(true)}>Reset this world</button> : (
            <div className="row" role="group" aria-label="Confirm reset">
              <p>This deletes every inhabitant's history on this device. It cannot be undone.</p>
              <button type="button" className="btn danger" onClick={() => { reset(); setConfirm(false); }}>Delete and restart</button>
              <button type="button" className="btn ghost" onClick={() => setConfirm(false)}>Keep my world</button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
export type { Agent };
