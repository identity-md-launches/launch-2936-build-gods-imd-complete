import { advance, newWorld, type World } from './sim';

const KEY = 'gods-of-imd:world:v1';
let world: World | null = null;
let listeners = new Set<() => void>();
let version = 0;
export let lastCatchUp = 0;
export let loadError: string | null = null;

export function load(now = Date.now()): World {
  if (world) return world;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const w = JSON.parse(raw) as World;
      if (w.version === 1 && Array.isArray(w.agents) && w.agents.length === 1000) world = w;
    }
  } catch (e) {
    loadError = 'Saved world could not be read, so a fresh world was created.';
  }
  if (!world) world = newWorld(now);
  lastCatchUp = advance(world, now);
  return world;
}

export function save() {
  if (!world) return;
  try { localStorage.setItem(KEY, JSON.stringify(world)); } catch { loadError = 'This browser refused to save the world (storage full or blocked).'; }
}

export function reset() {
  localStorage.removeItem(KEY);
  world = newWorld(Date.now());
  emit();
}

export const getWorld = () => world!;
export const getVersion = () => version;
export function emit() { version++; for (const l of listeners) l(); }
export function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }

let timer: number | undefined;
export function start() {
  if (timer) return;
  let saveCount = 0;
  timer = window.setInterval(() => {
    if (!world) return;
    advance(world, Date.now(), 30);
    emit();
    if (++saveCount % 10 === 0) save();
  }, 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });
  window.addEventListener('pagehide', save);
}
