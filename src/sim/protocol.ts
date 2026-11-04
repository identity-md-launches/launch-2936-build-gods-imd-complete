import { adopt, decide, release, trade, type Res, type World } from './sim';

export type Command =
  | { type: 'adopt'; id: number }
  | { type: 'release'; id: number }
  | { type: 'decision'; id: number; kind: 'priority' | 'goto' | 'duel' | 'stance'; arg: string }
  | { type: 'trade'; id: number; resource: Res; side: 'buy' | 'sell'; quantity: number };

export function validCommand(c: unknown): c is Command {
  if (!c || typeof c !== 'object') return false;
  const v = c as Record<string, unknown>;
  if (!Number.isInteger(v.id) || Number(v.id) < 1 || Number(v.id) > 1000) return false;
  if (v.type === 'adopt' || v.type === 'release') return true;
  if (v.type === 'decision') return ['priority', 'goto', 'duel', 'stance'].includes(String(v.kind)) && typeof v.arg === 'string' && v.arg.length <= 100;
  return v.type === 'trade' && ['food', 'wood', 'ore', 'herbs'].includes(String(v.resource)) && ['buy', 'sell'].includes(String(v.side)) && Number.isInteger(v.quantity) && Number(v.quantity) >= 1 && Number(v.quantity) <= 100;
}

export function applyCommand(w: World, c: Command, now: number): string {
  if (!validCommand(c)) throw new Error('Invalid command. Check the inhabitant and order.');
  if (c.type === 'adopt') { const error = adopt(w, c.id); if (error) throw new Error(error); return `You now guide ${c.id}. Open their profile to give orders.`; }
  if (c.type === 'release') { if (!w.adopted.includes(c.id)) throw new Error('You do not guide this inhabitant.'); release(w, c.id); return 'Inhabitant released.'; }
  if (c.type === 'trade') return trade(w, c.id, c.resource, c.side, c.quantity, now);
  const d = decide(w, c.id, c.kind, c.arg, now);
  return `${d.text}: ${d.status}. ${d.reason}`;
}
