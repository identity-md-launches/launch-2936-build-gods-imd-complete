import { useCallback, useEffect, useRef, useState } from 'react';
import WorldCanvas from './ui/WorldCanvas';
import { useWorld } from './ui/useWorld';
import { adopt, G, summary } from './sim/sim';
import { emit, lastCatchUp, loadError, save } from './sim/store';
import { activity, FactionTag, fmtDur, Portrait } from './ui/common';
import { EVENT_INFO, seasonAt } from './sim/rules';
import { LOC } from './sim/world';
import { ArenaPage, ChroniclePage, CouncilPage, EventsPage, FactionsPage, InhabitantsPage, ProfilePage, SeasonPage } from './ui/pages';
import { toggleSound } from './ui/sound';

const NAV = [
  ['#/', 'World'], ['#/inhabitants', 'Inhabitants'], ['#/factions', 'Factions'], ['#/arena', 'Arena'],
  ['#/events', 'Events'], ['#/season', 'Season'], ['#/chronicle', 'Chronicle'], ['#/council', 'Council'],
] as const;

function useRoute() {
  const [h, setH] = useState(location.hash || '#/');
  useEffect(() => {
    const f = () => { setH(location.hash || '#/'); };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return h;
}

function useReducedMotion() {
  const [r, setR] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const m = matchMedia('(prefers-reduced-motion: reduce)');
    const f = () => setR(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  return r;
}

export default function App() {
  const route = useRoute();
  const reduced = useReducedMotion();
  const [sound, setSound] = useState(false);
  const help = useRef<HTMLDialogElement>(null);
  const main = useRef<HTMLElement>(null);
  const first = useRef(true);
  const [path, arg] = route.replace(/^#\/?/, '').split('/');

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    window.scrollTo(0, 0);
    main.current?.focus({ preventScroll: true });
    const label = NAV.find(([h]) => h === `#/${path}`)?.[1] ?? (path === 'inhabitant' ? 'Inhabitant' : 'World');
    document.title = label === 'World' ? 'Gods of IMD' : `${label} | Gods of IMD`;
  }, [route, path]);

  let page;
  switch (path) {
    case 'inhabitants': page = <InhabitantsPage />; break;
    case 'inhabitant': page = <ProfilePage id={Number(arg)} />; break;
    case 'factions': page = <FactionsPage />; break;
    case 'arena': page = <ArenaPage duelId={arg} />; break;
    case 'events': page = <EventsPage />; break;
    case 'season': page = <SeasonPage />; break;
    case 'chronicle': page = <ChroniclePage />; break;
    case 'council': page = <CouncilPage />; break;
    default: page = <WorldPage reduced={reduced} focus={Number(new URLSearchParams(route.split('?')[1]).get('focus')) || null} />;
  }
  const active = path === 'inhabitant' ? '#/inhabitants' : `#/${path || ''}`;
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <header className="top">
        <a className="brand" href="#/" aria-label="Gods of IMD, world view">
          <img src="./favicon.svg" width="24" height="24" alt="" />Gods of IMD
        </a>
        <div className="utils">
          <button type="button" className="btn ghost" aria-pressed={sound} onClick={() => setSound(toggleSound())}>Sound</button>
          <button type="button" className="btn ghost" onClick={() => help.current?.showModal()}>Help</button>
        </div>
      </header>
      <nav className="nav" aria-label="Main">
        <ul>
          {NAV.map(([h, l]) => <li key={h}><a href={h} aria-current={active === h ? 'page' : undefined}>{l}</a></li>)}
        </ul>
      </nav>
      <main id="main" ref={main} tabIndex={-1}>{page}</main>
      <footer className="foot">
        <p>The world runs in your browser and is saved on this device only. There is no game server, wallet or contract in this build. <a href="#/council">What is live and what is not</a></p>
      </footer>
      <dialog ref={help} className="help" aria-labelledby="help-title" onClick={(e) => { if (e.target === help.current) help.current.close(); }}>
        <h2 id="help-title">How to play</h2>
        <ol>
          <li>Tap anyone on the map, or press Adopt to pick a random inhabitant.</li>
          <li>Open their profile to set a priority, send them somewhere or challenge a rival to a duel.</li>
          <li>Every 09:00, 15:00 and 21:00 UTC a new world event begins. Take your faction's stance on the Events page.</li>
          <li>Inhabitants act on their own between your orders. Seasons last 15 days and rank everyone by score.</li>
        </ol>
        <p>Map: drag to pan, arrow keys after focusing it, plus and minus to zoom.</p>
        <form method="dialog"><button className="btn primary" type="submit">Close</button></form>
      </dialog>
    </>
  );
}

function WorldPage({ reduced, focus }: { reduced: boolean; focus: number | null }) {
  const w = useWorld();
  const [sel, setSel] = useState<number | null>(focus);
  const [msg, setMsg] = useState<string | null>(null);
  const onSelect = useCallback((id: number | null) => { setSel(id); setMsg(null); }, []);
  const s = summary(w);
  const ev = w.event;
  const now = Date.now();
  const season = seasonAt(now);
  const day = Math.floor((now - season.start) / 86400e3) + 1;
  const a = sel ? w.agents[sel - 1] : null;
  const g = sel ? G()[sel - 1] : null;

  const adoptOne = (id?: number) => {
    let target = id;
    if (!target) {
      const pool = w.agents.filter((x) => x.alive && !w.adopted.includes(x.id));
      target = pool[Math.floor(Math.random() * pool.length)]?.id;
    }
    if (!target) return;
    const err = adopt(w, target);
    if (err) { setMsg(err); return; }
    setSel(target); save(); emit();
    setMsg(`You now guide ${G()[target - 1].name}. Open the profile to give orders.`);
  };

  return (
    <div className="world">
      <section className="stage" aria-label="World">
        <WorldCanvas selected={sel} onSelect={onSelect} reduced={reduced} />
        <p className="status" aria-live="off">
          <span>{s.alive} living</span><span>{s.infected} sick</span><span>Season {season.n}, day {day} of 15</span>
          {ev && <span>{ev.kind}, {fmtDur(ev.end - now)} left</span>}
        </p>
      </section>
      <aside className="panel">
        {!a || !g ? (
          <div className="intro">
            <h1>The world never stops living</h1>
            <p>A browser RPG where 1,000 Genesis inhabitants work, trade and fight on their own. Adopt one and guide it.</p>
            <button type="button" className="btn primary big" onClick={() => adoptOne()}>Adopt an inhabitant</button>
            <p className="hint">Or tap any dot on the map to meet that inhabitant first.</p>
          </div>
        ) : (
          <div className="pick">
            <div className="pick-head">
              <Portrait id={a.id} size={72} />
              <div>
                <h1 className="h2">{g.name}</h1>
                <p className="muted">#{a.id} <FactionTag f={g.faction} /> {g.rarity} {g.role.toLowerCase()}, level {a.level}</p>
                <p>{activity(a)} at {LOC[a.loc].name}{a.infected ? ', infected' : ''}</p>
              </div>
            </div>
            <div className="row">
              {w.adopted.includes(a.id)
                ? <a className="btn primary" href={`#/inhabitant/${a.id}`}>Give orders</a>
                : <button type="button" className="btn primary" onClick={() => adoptOne(a.id)}>Adopt {g.name.split(' ')[0]}</button>}
              <a className="btn" href={`#/inhabitant/${a.id}`}>View profile</a>
              <button type="button" className="btn ghost" onClick={() => setSel(null)}>Deselect</button>
            </div>
          </div>
        )}
        {msg && <p className="note" role="status">{msg}</p>}
        {lastCatchUp > 0 && <p className="hint">Caught up {fmtDur(lastCatchUp * 1000)} of world time since your last visit.</p>}
        {loadError && <p className="error" role="alert">{loadError}</p>}
        {w.adopted.length > 0 && (
          <div>
            <h2 className="h3">Your inhabitants</h2>
            <ul className="mini">
              {w.adopted.map((id) => { const x = w.agents[id - 1]; return (
                <li key={id}><button type="button" className="linklike" onClick={() => setSel(id)}><Portrait id={id} size={32} />{G()[id - 1].name}</button><span className="muted">{activity(x)}, health {Math.round(x.health)}</span></li>
              ); })}
            </ul>
          </div>
        )}
        {ev && (
          <div>
            <h2 className="h3">Now: {ev.kind}</h2>
            <p className="muted">{EVENT_INFO[ev.kind].effect} <a href="#/events">Event details</a></p>
          </div>
        )}
        <div>
          <h2 className="h3">Latest in the Chronicle</h2>
          <ul className="feed">
            {w.chronicle.slice(0, 4).map((c, i) => <li key={i}>{c.ref ? <a href={c.ref}>{c.text}</a> : c.text}</li>)}
          </ul>
        </div>
      </aside>
    </div>
  );
}
