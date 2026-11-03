import { useMemo } from 'react';
import { FACTION_INFO, portraitSvg, type Faction } from '../sim/genesis';
import { G, type Agent } from '../sim/sim';

export function Portrait({ id, size = 64 }: { id: number; size?: number }) {
  const src = useMemo(() => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(portraitSvg(G()[id - 1]))}`, [id]);
  return <img className="portrait" src={src} width={size} height={size} alt="" loading="lazy" />;
}

export function FactionTag({ f }: { f: Faction }) {
  return <span className="ftag"><span className="dot" style={{ background: FACTION_INFO[f].color }} aria-hidden="true" />{f}</span>;
}

export function Meter({ label, value, max = 100 }: { label: string; value: number; max?: number }) {
  const v = Math.max(0, Math.round(value));
  return (
    <div className="meter">
      <span>{label}</span>
      <meter min={0} max={max} low={max * 0.3} high={max * 0.7} optimum={max} value={v} aria-label={label} />
      <span className="num">{v}</span>
    </div>
  );
}

export const ACT_LABEL: Record<string, string> = {
  eat: 'Eating', rest: 'Resting', heal: 'Healing', gather: 'Gathering', trade: 'Trading', craft: 'Crafting', socialize: 'Socializing',
  train: 'Training', duel: 'Seeking a duel', explore: 'Exploring', patrol: 'Patrolling', research: 'Researching a cure', raid: 'Raiding the Wyrm',
};
export function activity(a: Agent) {
  if (!a.alive) return 'Remembered';
  return a.arrived ? ACT_LABEL[a.act] : `Walking (${ACT_LABEL[a.act].toLowerCase()} next)`;
}

export const fmtUtc = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
export function fmtDur(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return h ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
}
export const gname = (id: number) => G()[id - 1].name;
