import { parseArgs } from 'node:util';
import { GameService } from './service';
import { gameServer } from './http';

const { values } = parseArgs({ options: { db: { type: 'string' }, port: { type: 'string', default: '8787' }, host: { type: 'string', default: '127.0.0.1' }, origins: { type: 'string' } } });
if (!values.db || !values.origins) throw new Error('Usage: npm run server -- --db <durable SQLite path> --origins <comma-separated website origins> [--port 8787] [--host 127.0.0.1]');
const port = Number(values.port);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port.');
const origins = values.origins.split(',').map(o => new URL(o.trim()).origin);
const game = new GameService(values.db);
const server = gameServer(game, origins);
server.listen(port, values.host, () => {
  console.log(`Gods of IMD authority listening on ${values.host}:${(server.address() as {port:number}).port}`);
  game.start();
});
server.on('error', error => { console.error(error.message); game.close(); process.exitCode = 1; });
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => server.close(() => { game.close(); }));
