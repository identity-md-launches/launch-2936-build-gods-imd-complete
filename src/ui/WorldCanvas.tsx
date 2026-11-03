import { useEffect, useRef, useState } from 'react';
import { FACTION_INFO } from '../sim/genesis';
import { LOCATIONS, MAP_H, MAP_W, tiles, type LocKind } from '../sim/world';
import { G, GAME_DAY_TICKS } from '../sim/sim';
import { getWorld, subscribe } from '../sim/store';

const TILE = 8;
const TILE_COLORS = ['#3d6b3a', '#24492b', '#2b5d80', '#6b6470', '#b7a77a', '#9a8460', '#7b8f3a'];
const ROOF: Record<LocKind, string> = {
  market: '#c9822f', workshop: '#8d6ad8', oracle: '#e8e2c8', infirmary: '#d8d8e8', memorial: '#9aa0a8', home: '#a5573a',
  hq: '#555', farm: '#c6b14a', forest: '#1d3d22', mine: '#4a4550', marsh: '#3e5a4a', training: '#8a5a3a', arena: '#b0452f',
  dungeon: '#2a2230', boss: '#5a1f1f', frontier: '#8f7f56', territory: '#c0b090',
};

function terrain(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = MAP_W * TILE; c.height = MAP_H * TILE;
  const g = c.getContext('2d')!;
  const t = tiles();
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    const v = t[y * MAP_W + x];
    g.fillStyle = TILE_COLORS[v]; g.fillRect(x * TILE, y * TILE, TILE, TILE);
    if (v === 1 && (x * 7 + y * 3) % 3 === 0) { g.fillStyle = '#183a20'; g.beginPath(); g.arc(x * TILE + 4, y * TILE + 4, 3, 0, 7); g.fill(); }
    if (v === 3 && (x + y) % 4 === 0) { g.fillStyle = '#8a8490'; g.beginPath(); g.moveTo(x * TILE, y * TILE + 8); g.lineTo(x * TILE + 4, y * TILE + 1); g.lineTo(x * TILE + 8, y * TILE + 8); g.fill(); }
    if (v === 6 && y % 2 === 0) { g.fillStyle = '#93a842'; g.fillRect(x * TILE, y * TILE + 3, TILE, 2); }
  }
  for (const l of LOCATIONS) {
    if (['farm', 'forest', 'mine', 'marsh', 'frontier'].includes(l.kind)) {
      g.strokeStyle = 'rgba(255,255,255,.25)'; g.setLineDash([3, 3]); g.strokeRect(l.x * TILE, l.y * TILE, l.w * TILE, l.h * TILE); g.setLineDash([]);
      continue;
    }
    const color = l.faction ? FACTION_INFO[l.faction].color : ROOF[l.kind];
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(l.x * TILE + 3, l.y * TILE + 3, l.w * TILE, l.h * TILE);
    g.fillStyle = '#4a3a2e'; g.fillRect(l.x * TILE, l.y * TILE, l.w * TILE, l.h * TILE);
    g.fillStyle = color; g.fillRect(l.x * TILE + 2, l.y * TILE + 2, l.w * TILE - 4, l.h * TILE * 0.55);
    if (l.kind === 'arena') { g.strokeStyle = '#f0d0a0'; g.lineWidth = 2; g.beginPath(); g.ellipse((l.x + l.w / 2) * TILE, (l.y + l.h * 0.7) * TILE, l.w * 3, 6, 0, 0, 7); g.stroke(); }
  }
  return c;
}

export interface Camera { zoom: number; cx: number; cy: number }

export default function WorldCanvas({ selected, onSelect, reduced }: { selected: number | null; onSelect: (id: number | null) => void; reduced: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cam = useRef<Camera>({ zoom: 1, cx: MAP_W / 2, cy: MAP_H / 2 });
  const lastTick = useRef(performance.now());
  const sel = useRef(selected);
  sel.current = selected;
  const [zoomLabel, setZoomLabel] = useState(1);

  useEffect(() => subscribe(() => { lastTick.current = performance.now(); }), []);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const bg = terrain();
    let raf = 0;
    const flakes = Array.from({ length: 120 }, (_, i) => [(i * 37) % MAP_W, (i * 53) % MAP_H, 0.3 + ((i * 13) % 10) / 20]);
    const gen = G();
    const draw = () => {
      const w = getWorld();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
        canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr);
      }
      const fit = Math.min(rect.width / (MAP_W * TILE), rect.height / (MAP_H * TILE));
      const scale = fit * cam.current.zoom * dpr;
      const c = cam.current;
      const halfW = canvas.width / scale / 2 / TILE, halfH = canvas.height / scale / 2 / TILE;
      c.cx = halfW * 2 >= MAP_W ? MAP_W / 2 : Math.min(MAP_W - halfW, Math.max(halfW, c.cx));
      c.cy = halfH * 2 >= MAP_H ? MAP_H / 2 : Math.min(MAP_H - halfH, Math.max(halfH, c.cy));
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#10141c'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(scale, 0, 0, scale, canvas.width / 2 - c.cx * TILE * scale, canvas.height / 2 - c.cy * TILE * scale);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(bg, 0, 0);
      // labels
      ctx.font = '600 7px system-ui, sans-serif'; ctx.textAlign = 'center';
      for (const l of LOCATIONS) {
        if (l.kind === 'home') continue;
        const tx = (l.x + l.w / 2) * TILE, ty = l.y * TILE - 2;
        ctx.fillStyle = 'rgba(10,12,18,.7)'; const tw = ctx.measureText(l.name).width; ctx.fillRect(tx - tw / 2 - 2, ty - 7, tw + 4, 9);
        ctx.fillStyle = '#f4ecd8'; ctx.fillText(l.name, tx, ty);
      }
      const alpha = reduced ? 1 : Math.min(1, (performance.now() - lastTick.current) / 1000);
      const t = performance.now() / 1000;
      // memorial stones
      for (const a of w.agents) if (!a.alive) { ctx.fillStyle = '#c9ccd2'; ctx.fillRect(a.x * TILE - 1.5, a.y * TILE - 2, 3, 4); }
      // monsters
      if (w.monsters > 0) { ctx.fillStyle = '#1a0a0a'; for (let i = 0; i < Math.min(w.monsters, 60); i++) { const mx = 22 + ((i * 17) % 50) + (reduced ? 0 : Math.sin(t + i) * 0.4); const my = 58 + ((i * 7) % 4); ctx.beginPath(); ctx.arc(mx * TILE, my * TILE, 2.4, 0, 7); ctx.fill(); } }
      // inhabitants
      for (const a of w.agents) {
        if (!a.alive) continue;
        const x = (a.px + (a.x - a.px) * alpha) * TILE, y = (a.py + (a.y - a.py) * alpha) * TILE;
        const bob = !reduced && !a.arrived ? Math.sin(t * 10 + a.id) * 0.6 : 0;
        ctx.fillStyle = FACTION_INFO[gen[a.id - 1].faction].color;
        ctx.beginPath(); ctx.arc(x, y + bob, 2, 0, 7); ctx.fill();
        if (a.infected) { ctx.fillStyle = '#7dff6a'; ctx.fillRect(x - 0.7, y - 4, 1.4, 1.4); }
        if (w.adopted.includes(a.id)) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(x, y + bob, 3.4, 0, 7); ctx.stroke(); }
      }
      if (sel.current) {
        const a = w.agents[sel.current - 1];
        const x = (a.px + (a.x - a.px) * alpha) * TILE, y = (a.py + (a.y - a.py) * alpha) * TILE;
        ctx.strokeStyle = '#5fe0e6'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, y, 5 + (reduced ? 0 : Math.sin(t * 4)), 0, 7); ctx.stroke();
      }
      // weather
      const kind = w.event?.kind;
      if (!reduced && (kind === 'Harsh Winter' || kind === 'Black Plague' || kind === 'Drought')) {
        ctx.fillStyle = kind === 'Harsh Winter' ? 'rgba(255,255,255,.85)' : kind === 'Black Plague' ? 'rgba(120,255,120,.25)' : 'rgba(255,200,120,.2)';
        for (const f of flakes) { const fx = (f[0] + t * f[2] * 2) % MAP_W, fy = (f[1] + t * f[2] * 4) % MAP_H; ctx.fillRect(fx * TILE, fy * TILE, kind === 'Harsh Winter' ? 1.2 : 4, kind === 'Harsh Winter' ? 1.2 : 4); }
      }
      // day and night
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const phase = (w.tick % GAME_DAY_TICKS) / GAME_DAY_TICKS;
      const dark = Math.max(0, Math.cos(phase * Math.PI * 2)) * 0.45;
      if (dark > 0.01) { ctx.fillStyle = `rgba(10,14,40,${dark.toFixed(3)})`; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      if (kind === 'Monster Invasion') { ctx.fillStyle = 'rgba(120,10,10,.12)'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  // pointer: drag to pan, tap to select
  useEffect(() => {
    const canvas = ref.current!;
    let down: { x: number; y: number; cx: number; cy: number; moved: boolean } | null = null;
    const toWorld = (ex: number, ey: number) => {
      const rect = canvas.getBoundingClientRect();
      const fit = Math.min(rect.width / (MAP_W * TILE), rect.height / (MAP_H * TILE)) * cam.current.zoom;
      return [cam.current.cx + (ex - rect.left - rect.width / 2) / fit / TILE, cam.current.cy + (ey - rect.top - rect.height / 2) / fit / TILE, fit] as const;
    };
    const pd = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY, cx: cam.current.cx, cy: cam.current.cy, moved: false }; canvas.setPointerCapture(e.pointerId); };
    const pm = (e: PointerEvent) => {
      if (!down) return;
      const [, , fit] = toWorld(e.clientX, e.clientY);
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) down.moved = true;
      if (down.moved) { cam.current.cx = down.cx - dx / fit / TILE; cam.current.cy = down.cy - dy / fit / TILE; }
    };
    const pu = (e: PointerEvent) => {
      if (down && !down.moved) {
        const [wx, wy, fit] = toWorld(e.clientX, e.clientY);
        let best: number | null = null, bd = Math.max(1.2, 14 / fit / TILE);
        for (const a of getWorld().agents) { if (!a.alive) continue; const d = Math.hypot(a.x - wx, a.y - wy); if (d < bd) { bd = d; best = a.id; } }
        onSelect(best);
      }
      down = null;
    };
    canvas.addEventListener('pointerdown', pd); canvas.addEventListener('pointermove', pm); canvas.addEventListener('pointerup', pu);
    return () => { canvas.removeEventListener('pointerdown', pd); canvas.removeEventListener('pointermove', pm); canvas.removeEventListener('pointerup', pu); };
  }, [onSelect]);

  useEffect(() => {
    if (!selected) return;
    const a = getWorld().agents[selected - 1];
    if (cam.current.zoom > 1) { cam.current.cx = a.x; cam.current.cy = a.y; }
  }, [selected]);

  const zoom = (d: number) => { cam.current.zoom = Math.max(1, Math.min(4, cam.current.zoom + d)); setZoomLabel(cam.current.zoom); };
  const key = (e: React.KeyboardEvent) => {
    const step = 4 / cam.current.zoom;
    if (e.key === 'ArrowLeft') cam.current.cx -= step; else if (e.key === 'ArrowRight') cam.current.cx += step;
    else if (e.key === 'ArrowUp') cam.current.cy -= step; else if (e.key === 'ArrowDown') cam.current.cy += step;
    else if (e.key === '+' || e.key === '=') zoom(1); else if (e.key === '-') zoom(-1); else return;
    e.preventDefault();
  };
  return (
    <div className="scene">
      <canvas ref={ref} tabIndex={0} onKeyDown={key} aria-label="Living world map. Drag or use arrow keys to pan, plus and minus to zoom, tap an inhabitant to inspect it." role="img" />
      <div className="zoom" role="group" aria-label="Map zoom">
        <button type="button" className="btn icon" onClick={() => zoom(1)} disabled={zoomLabel >= 4} aria-label="Zoom in">+</button>
        <button type="button" className="btn icon" onClick={() => zoom(-1)} disabled={zoomLabel <= 1} aria-label="Zoom out">−</button>
      </div>
    </div>
  );
}
