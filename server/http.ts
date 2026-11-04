import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { gzipSync } from 'node:zlib';
import { ApiError, GameService } from './service';
import { validCommand } from '../src/sim/protocol';

export function gameServer(game: GameService, allowedOrigins: string[]) {
  const rates = new Map<string, { at: number; count: number }>();
  const json = (res: ServerResponse, status: number, value: unknown, req: IncomingMessage) => {
    const body = Buffer.from(JSON.stringify(value));
    res.statusCode = status;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    if (body.length > 1024 && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '')) { res.setHeader('content-encoding', 'gzip'); res.end(gzipSync(body)); }
    else res.end(body);
  };
  const read = async (req: IncomingMessage) => {
    if (!req.headers['content-type']?.startsWith('application/json')) throw new ApiError(415, 'Send application/json.');
    let raw = '';
    for await (const data of req) { raw += data; if (Buffer.byteLength(raw) > 4096) throw new ApiError(413, 'Request too large.'); }
    try { return JSON.parse(raw); } catch { throw new ApiError(400, 'Invalid JSON.'); }
  };
  return createServer(async (req, res) => {
    res.setHeader('cache-control', 'no-store');
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('vary', 'Origin, Accept-Encoding');
    try {
      const origin = req.headers.origin;
      if (origin && !allowedOrigins.includes(origin)) throw new ApiError(403, 'This website origin is not permitted by the world operator.');
      if (origin) res.setHeader('access-control-allow-origin', origin);
      res.setHeader('access-control-allow-headers', 'Authorization, Content-Type');
      res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
      if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
      // The reverse proxy must enforce deployment-wide rate and connection limits too.
      const ip = req.socket.remoteAddress ?? 'unknown';
      const prior = rates.get(ip);
      const rate = prior && Date.now() - prior.at < 60000 ? prior : { at: Date.now(), count: 0 };
      if (++rate.count > 180) throw new ApiError(429, 'Too many requests. Wait a minute and retry.');
      if (rates.size > 10000) rates.clear();
      rates.set(ip, rate);
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/health') {
        json(res, game.failure ? 503 : 200, { status: game.failure ? 'unhealthy' : Date.now() - game.world.lastReal >= 2000 ? 'recovering' : 'ready', tick: game.world.tick, lastReal: game.world.lastReal, revision: game.revision }, req); return;
      }
      if (req.method === 'POST' && url.pathname === '/session') {
        const body = await read(req);
        if (!body || Object.keys(body).length) throw new ApiError(400, 'Session creation takes an empty object.');
        json(res, 201, { token: game.createSession() }, req); return;
      }
      const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
      game.authenticate(token);
      if (req.method === 'GET' && url.pathname === '/state') { json(res, 200, game.snapshot(token), req); return; }
      if (req.method === 'GET' && url.pathname === '/chronicle') {
        const before = Number(url.searchParams.get('before') ?? Number.MAX_SAFE_INTEGER);
        if (!Number.isSafeInteger(before) || before < 1) throw new ApiError(400, 'Invalid history cursor.');
        const records = game.records(url.searchParams.get('kind'), before);
        json(res, 200, { records, nextBefore: records.at(-1)?.sequence ?? null }, req); return;
      }
      if (req.method === 'POST' && url.pathname === '/command') {
        const body = await read(req);
        if (!validCommand(body?.command) || typeof body.requestId !== 'string') throw new ApiError(400, 'Invalid command.');
        json(res, 200, game.command(token, body.requestId, body.command), req); return;
      }
      throw new ApiError(404, 'No such game endpoint.');
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 400;
      const message = error instanceof ApiError || (error instanceof Error && !/SQL|database|constraint/i.test(error.message)) ? (error as Error).message : 'The command could not be saved. Retry or contact the operator.';
      json(res, status, { error: message }, req);
    }
  });
}
