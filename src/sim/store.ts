import { advance, newWorld, type World } from './sim';
import { applyCommand, type Command } from './protocol';

const KEY = 'gods-of-imd:world:v1';
const API_KEY = 'gods-of-imd:api';
let world: World | null = null;
const listeners = new Set<() => void>();
let version = 0;
let generation = 0;
let remoteRevision = -1;
let token = '';
let polling: number | undefined;
let localCatchupUntil = 0;
export let lastCatchUp = 0;
export let loadError: string | null = null;
export const connection = { mode: 'local' as 'local' | 'connecting' | 'shared' | 'error', apiUrl: '', pending: false, recovering: false, error: '' };

export function load(now = Date.now()): World {
  if (world) return world;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const w = JSON.parse(raw) as World;
      if (w.version === 1 && Array.isArray(w.agents) && w.agents.length === 1000) { w.eventHistory ??= []; world = w; }
    }
  } catch {
    loadError = 'Saved world could not be read. This temporary world remains playable; enable browser storage to keep it.';
  }
  if (!world) world = newWorld(now);
  // Local catch-up uses batches as well; elapsed time is never discarded.
  lastCatchUp = advance(world, now, 30);
  localCatchupUntil = now;
  return world;
}

export function save() {
  if (!world || connection.mode !== 'local') return;
  try { localStorage.setItem(KEY, JSON.stringify(world)); } catch { loadError = 'This browser refused to save the world (storage full or blocked). Enable storage to keep this temporary world.'; }
}

export function reset() {
  if (connection.mode !== 'local') return;
  try { localStorage.removeItem(KEY); } catch { loadError = 'Storage is blocked. The temporary world was restarted for this visit.'; }
  world = newWorld(Date.now());
  save(); emit();
}

export const getWorld = () => world!;
export const getVersion = () => version;
export function emit() { version++; for (const l of listeners) l(); }
export function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }

async function request(path: string, body?: unknown, withToken = true) {
  const response = await fetch(`${connection.apiUrl}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...(withToken ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(10000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `World service returned ${response.status}.`);
  return data;
}

function accept(data: { world: World; revision: number; recovering: boolean }, gen: number) {
  if (gen !== generation || data.revision < remoteRevision) return;
  if (data.world?.version !== 1 || data.world.agents?.length !== 1000) throw new Error('The service returned an incompatible world.');
  world = data.world; world.eventHistory ??= [];
  remoteRevision = data.revision; connection.recovering = data.recovering;
  connection.error = ''; connection.mode = 'shared'; emit();
}

function schedulePoll(gen: number) {
  clearTimeout(polling);
  polling = window.setTimeout(async () => {
    if (gen !== generation) return;
    try { accept(await request('/state'), gen); }
    catch (error) { if (gen === generation) { connection.error = `Shared world update failed. ${message(error)} Retry the connection in Council.`; emit(); } }
    if (gen === generation) schedulePoll(gen);
  }, 2000);
}
const message = (e: unknown) => e instanceof Error ? e.message : 'The action could not be completed. Retry.';

export async function connect(apiUrl: string) {
  const url = new URL(apiUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Enter an HTTP(S) world service URL without credentials, query or hash.');
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Use HTTPS for a public world service.');
  if (connection.mode === 'local') save();
  const gen = ++generation;
  clearTimeout(polling);
  connection.mode = 'connecting'; connection.apiUrl = url.href.replace(/\/$/, ''); connection.error = ''; remoteRevision = -1;
  try { localStorage.setItem(API_KEY, connection.apiUrl); token = localStorage.getItem(`gods-of-imd:session:${connection.apiUrl}`) ?? ''; } catch { token = ''; loadError = 'Storage is blocked. Your shared session will last for this visit only.'; }
  emit();
  try {
    if (!token) {
      const result = await request('/session', {}, false);
      if (gen !== generation) return;
      token = result.token;
      try { localStorage.setItem(`gods-of-imd:session:${connection.apiUrl}`, token); } catch { /* temporary session is still usable */ }
    }
    let data;
    try { data = await request('/state'); }
    catch (error) {
      if (!message(error).includes('session is unknown') && !message(error).includes('Join the shared world')) throw error;
      const result = await request('/session', {}, false); token = result.token;
      try { localStorage.setItem(`gods-of-imd:session:${connection.apiUrl}`, token); } catch { /* temporary session */ }
      data = await request('/state');
    }
    accept(data, gen);
    if (gen === generation) schedulePoll(gen);
  } catch (error) {
    if (gen === generation) { connection.mode = 'error'; connection.error = `Unable to join the shared world. ${message(error)} Check the service URL and retry.`; emit(); }
    throw error;
  }
}

export function useLocalWorld() {
  ++generation; clearTimeout(polling);
  connection.mode = 'local'; connection.apiUrl = ''; connection.error = ''; connection.recovering = false; connection.pending = false;
  try { localStorage.setItem(API_KEY, ''); } catch { /* local loader shows the storage warning */ }
  world = null; load(); emit();
}

export async function execute(command: Command): Promise<string> {
  if (connection.mode === 'connecting' || connection.mode === 'error') throw new Error('Join the shared world first, or choose local play in Council.');
  if (connection.pending) throw new Error('An order is being saved. Wait for its response.');
  if (connection.recovering) throw new Error('The shared world is catching up. Wait for recovery to finish.');
  if (connection.mode === 'local') { const result = applyCommand(world!, command, Date.now()); save(); emit(); return result; }
  const gen = generation;
  connection.pending = true; emit();
  try {
    const result = await request('/command', { requestId: crypto.randomUUID(), command });
    accept(result, gen); return result.message;
  } catch (error) { throw new Error(`Order not confirmed. ${message(error)} Refresh the shared world before retrying.`); }
  finally { if (gen === generation) { connection.pending = false; emit(); } }
}

let timer: number | undefined;
export function start() {
  if (timer) return;
  let saveCount = 0;
  timer = window.setInterval(() => {
    if (!world || connection.mode !== 'local') return;
    const backlog = Math.max(0, Math.floor((localCatchupUntil - world.lastReal) / 1000));
    const advanced = advance(world, Date.now(), 30);
    lastCatchUp += Math.min(backlog, advanced);
    emit();
    if (++saveCount % 10 === 0) save();
  }, 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });
  window.addEventListener('pagehide', save);
  void (async () => {
    let chosen: string | null = null;
    try { chosen = localStorage.getItem(API_KEY); } catch { /* local mode works without storage */ }
    if (chosen === null) {
      try { const response = await fetch('./server.json', { cache: 'no-store' }); if (response.ok) chosen = (await response.json()).apiUrl || ''; } catch { /* unconfigured static site stays local */ }
    }
    if (chosen) await connect(chosen).catch(() => { /* connection error and retry stay visible */ });
  })();
}
