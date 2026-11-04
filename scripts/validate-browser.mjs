// Optional browser validation: GODS_PLAYWRIGHT=/absolute/path/to/playwright/index.mjs npm run test:browser
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { extname, resolve, sep, join } from 'node:path';
import { tmpdir } from 'node:os';
import { GameService } from '../server/service.ts';
import { gameServer } from '../server/http.ts';
import { chron, gainXp, newWorld, syncEvent } from '../src/sim/sim.ts';
const { chromium, webkit } = await import(process.env.GODS_PLAYWRIGHT || 'playwright');
const root = resolve('dist'), out = resolve('test/scratch/browser');
await mkdir(out, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/preview/')) throw Error();
    const path = resolve(root, decodeURIComponent(url.pathname.slice(9)) || 'index.html');
    if (!path.startsWith(root + sep)) throw Error();
    res.setHeader('Content-Type', types[extname(path)] || 'application/octet-stream');
    res.end(await readFile(path));
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`, url = `${origin}/preview/`;
const dataDir = await mkdtemp(join(tmpdir(), 'gods-browser-'));
const game = new GameService(join(dataDir, 'world.sqlite'));
const api = gameServer(game, [origin]);
await new Promise(r => api.listen(0, '127.0.0.1', r));
const apiUrl = `http://127.0.0.1:${api.address().port}`;
game.start();
const T0 = Date.UTC(2026, 10, 3, 10), results = [];
const check = (name, fn) => { assert(fn, name); results.push(name); console.log('PASS', name); };
const snap = async (page, name) => { await page.screenshot({ path: join(out, name + '.png'), fullPage: false }); };
const freeze = async (page, t = T0) => { await page.clock.install({ time: new Date(t) }); await page.clock.pauseAt(new Date(t)); };
const errors = [], resourceErrors = [], consoleErrors = [];
function watch(page) {
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400 && !r.url().startsWith(apiUrl)) resourceErrors.push(`${r.status()} ${new URL(r.url()).pathname}`); });
}
let browser;
try {
  for (const engine of [chromium, webkit]) {
    browser = await engine.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const p = await context.newPage(); watch(p); await freeze(p);
    await p.goto(url); await p.locator('h1').waitFor(); await p.clock.runFor(100);
    const main = p.getByRole('button', { name: 'Adopt an inhabitant', exact: true });
    check(`${engine.name()}: product and adopt on first phone screen`, (await main.boundingBox()).y + (await main.boundingBox()).height <= 844 && await p.locator('canvas').isVisible());
    await snap(p, `${engine.name()}-world-390`);
    await main.click(); await p.getByRole('link', { name: 'Give orders', exact: true }).waitFor();
    check(`${engine.name()}: main adoption works`, await p.getByText(/You now guide/).isVisible());
    await p.goto(url + '#/inhabitant/1'); await p.locator('.profile').waitFor();
    if (await p.getByRole('button', { name: 'Adopt', exact: true }).count()) await p.getByRole('button', { name: 'Adopt', exact: true }).click();
    await p.getByRole('combobox', { name: 'Priority', exact: true }).selectOption('rest'); await p.getByRole('button', { name: 'Set priority', exact: true }).click();
    await p.getByRole('status').filter({ hasText: 'Set priority: rest: done' }).waitFor();
    check(`${engine.name()}: validated priority`, true);
    await p.getByRole('combobox', { name: 'Destination', exact: true }).selectOption('boss'); await p.getByRole('button', { name: 'Send', exact: true }).click();
    await p.getByRole('status').filter({ hasText: 'rejected' }).waitFor(); check(`${engine.name()}: dangerous order rejected`, true);
    await p.getByLabel('Rival token id').fill('251'); await p.getByRole('button', { name: 'Challenge to duel' }).click();
    await p.clock.runFor(52000);
    const state52 = await p.evaluate(() => JSON.parse(localStorage.getItem('gods-of-imd:world:v1')));
    check(`${engine.name()}: duel stays pending while challenger travels`, state52.decisions.find(d => d.text.includes('Challenge #251')).status === 'accepted' && state52.duels.length === 0);
    await p.clock.runFor(160000);
    await p.goto(url + '#/arena'); await p.getByRole('heading', {level:1,name:'Arena of Ash',exact:true}).waitFor(); check(`${engine.name()}: duel result stored after rendezvous`, await p.getByRole('link', { name: /beat/ }).count() > 0);
    await p.goto(url + '#/inhabitants'); await p.getByRole('heading', {level:1,name:'Inhabitants',exact:true}).waitFor(); await p.getByLabel('Search', { exact: true }).fill('no such person');
    await p.getByText('Nobody matches these filters.', { exact: false }).waitFor(); check(`${engine.name()}: directory empty state`, true);
    await p.getByLabel('Search', { exact: true }).fill(''); await p.getByRole('button', { name: 'Show 48 more' }).click(); check(`${engine.name()}: directory pagination`, await p.locator('.person').count() === 96);
    await p.goto(url + '#/factions'); await p.getByRole('link', { name: 'Browse Wilds members' }).click();
    check(`${engine.name()}: faction link`, await p.getByRole('combobox', { name: 'Faction', exact: true }).inputValue() === 'Wilds');
    await p.goto(url + '#/events'); await p.locator('.skip').focus(); await p.keyboard.press('Enter');
    check(`${engine.name()}: skip retains route and focuses main`, await p.evaluate(() => location.hash === '#/events' && document.activeElement.id === 'main') && await p.locator('h1').innerText() === 'World events');
    await p.getByRole('button', { name: 'Help', exact: true }).click(); check(`${engine.name()}: help opens`, await p.getByRole('dialog').isVisible());
    await p.keyboard.press('Escape'); check(`${engine.name()}: help restores focus`, await p.getByRole('button', { name: 'Help', exact: true }).evaluate(e => e === document.activeElement));
    for (const width of [320, 390, 900, 1440]) {
      await p.setViewportSize({ width, height: 900 });
      for (const route of ['', 'inhabitants', 'inhabitant/1', 'factions', 'arena', 'events', 'season', 'marketplace', 'chronicle', 'council']) {
        await p.goto(url + '#/' + route); await p.waitForFunction((route) => { const h=document.querySelector('h1')?.textContent; const names={'':'The world never stops living',inhabitants:'Inhabitants','inhabitant/1':'Ashador the Anvil',factions:'Factions',arena:'Arena of Ash',events:'World events',marketplace:'Grand Marketplace',chronicle:'Chronicle',council:'Council'};return route==='season'?h?.startsWith('Season '):h===names[route]; }, route);
        const measure = await p.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: document.documentElement.clientWidth, help: document.querySelector('.utils').getBoundingClientRect().right }));
        check(`${engine.name()}: ${route || 'world'} reflows at ${width}`, measure.scroll <= measure.width && measure.help <= measure.width);
      }
    }
    await p.setViewportSize({ width: 1440, height: 900 }); await p.goto(url); await p.clock.runFor(100); await snap(p, `${engine.name()}-world-1440`);
    await context.close();

    const blocked = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await blocked.addInitScript(() => { for (const method of ['getItem', 'setItem', 'removeItem']) Storage.prototype[method] = () => { throw new DOMException('Storage access blocked', 'SecurityError'); }; });
    const bp = await blocked.newPage(); watch(bp); await freeze(bp); await bp.goto(url);
    await bp.getByRole('alert').waitFor(); await bp.getByRole('link', { name: 'Inhabitants', exact: true }).click(); await bp.locator('.person').first().waitFor();
    check(`${engine.name()}: blocked storage directory`, await bp.locator('.person').count() === 48 && await bp.getByRole('alert').count() > 0);
    await bp.getByRole('link', { name: 'Factions', exact: true }).click(); await bp.getByRole('link', { name: 'Browse Wilds members' }).click();
    check(`${engine.name()}: blocked faction filter degrades safely`, await bp.getByRole('combobox', { name: 'Faction', exact: true }).inputValue() === 'all');
    await bp.goto(url + '#/inhabitant/1'); await bp.getByRole('button', { name: 'Adopt', exact: true }).click(); await bp.getByRole('button', { name: 'Set priority', exact: true }).click();
    check(`${engine.name()}: temporary world playable`, await bp.getByRole('status').filter({ hasText: 'Set priority: gather: done' }).count() === 1);
    await blocked.close();

    const evidence = newWorld(T0); evidence.adopted = [1]; const a = evidence.agents[0]; a.loc = 'market'; a.arrived = true; a.coins = 100; a.inv.wood = 8; a.timer = 999;
    chron(evidence, T0, 'death', 'Permanent test memorial'); for (let i = 0; i < 401; i++) chron(evidence, T0 + i, 'discovery', `Discovery ${i}`);
    for (let i = 0; i < 65; i++) gainXp(evidence, a, 1000000, T0 + i);
    const evTime = Date.UTC(2026, 10, 5, 21); syncEvent(evidence, evTime); syncEvent(evidence, evidence.event.end); evidence.lastReal = evidence.event.start;
    const ec = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ec.addInitScript(raw => localStorage.setItem('gods-of-imd:world:v1', raw), JSON.stringify(evidence));
    const ep = await ec.newPage(); watch(ep); await freeze(ep, evidence.lastReal);
    await ep.goto(url + '#/chronicle');
    for (let i = 0; i < 4; i++) if (await ep.getByRole('button', { name: 'Show older records' }).count()) await ep.getByRole('button', { name: 'Show older records' }).click();
    check(`${engine.name()}: oldest memorial retrievable`, await ep.getByText('Permanent test memorial', { exact: false }).count() === 1);
    await ep.getByRole('combobox', { name: 'Show', exact: true }).selectOption('death'); check(`${engine.name()}: permanent record filter`, await ep.locator('.chronicle li').count() === 1);
    await ep.goto(url + '#/inhabitant/1'); await ep.getByRole('button', { name: 'Show older history' }).click(); check(`${engine.name()}: full character history`, await ep.getByText('Reached level 2.', { exact: true }).count() === 1);
    await ep.goto(url + '#/events'); await ep.locator('summary').filter({ hasText: 'EV-20261105-21' }).click();
    check(`${engine.name()}: archived Oracle JSON`, (await ep.locator('.oracle-record').filter({hasText:'OR-EV-20261105-21'}).locator('.code').innerText()).includes('OR-EV-20261105-21') && (await ep.locator('.oracle-record').filter({hasText:'OR-EV-20261105-21'}).locator('.code').innerText()).includes('fallback-deterministic'));
    await snap(ep, `${engine.name()}-oracle-390`);
    await ep.goto(url + '#/marketplace'); await ep.getByRole('combobox', { name: 'Good', exact: true }).selectOption('food');
    await ep.getByRole('button', { name: 'Buy goods', exact: true }).click(); await ep.getByRole('status').filter({ hasText: 'Bought 1 food for 3.00 coins' }).waitFor();
    check(`${engine.name()}: market purchase changes coins and inventory`, (await ep.locator('.market-summary').innerText()).includes('Coins: 97.00') && (await ep.locator('.market-summary').innerText()).includes('4 food'));
    await ep.getByRole('combobox', { name: 'Good', exact: true }).selectOption('wood'); await ep.getByRole('combobox', { name: 'Action', exact: true }).selectOption('sell');
    await ep.getByRole('button', { name: 'Sell goods', exact: true }).click(); await ep.getByRole('status').filter({ hasText: 'Sold 1 wood' }).waitFor(); check(`${engine.name()}: market sale`, true);
    await ep.getByRole('combobox', { name: 'Good', exact: true }).selectOption('ore'); await ep.getByRole('button', { name: 'Sell goods', exact: true }).click();
    await ep.getByRole('status').filter({ hasText: 'Not enough goods' }).waitFor(); check(`${engine.name()}: market error`, true);
    await ep.getByRole('combobox', { name: 'Action', exact: true }).selectOption('buy'); await snap(ep, `${engine.name()}-marketplace-390`);
    await ep.setViewportSize({ width: 1440, height: 900 }); await snap(ep, `${engine.name()}-marketplace-1440`);
    await ec.close(); await browser.close(); browser = undefined;
  }

  // Shared browser integration uses the real scheduler and wall clock.
  browser = await chromium.launch();
  const ca = await browser.newContext({ viewport: { width: 390, height: 844 } }), cb = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pa = await ca.newPage(), pb = await cb.newPage(); watch(pa); watch(pb);
  for (const p of [pa, pb]) {
    await p.goto(url + '#/council'); await p.getByLabel('World service URL').fill(apiUrl); await p.getByRole('button', { name: 'Join shared world', exact: true }).click();
    await p.getByText('Joined the shared world.', { exact: true }).waitFor();
  }
  await pa.goto(url + '#/inhabitant/1'); await pa.locator('.profile').waitFor(); await pa.getByRole('button', { name: 'Adopt', exact: true }).click(); await pa.getByRole('button', { name: 'Release', exact: true }).waitFor();
  await pb.goto(url + '#/inhabitant/1'); await pb.locator('.profile').waitFor(); await pb.getByRole('button', { name: 'Adopt', exact: true }).click();
  await pb.getByRole('status').filter({ hasText: 'Another player already guides' }).waitFor(); check('shared: exclusive adoption across browser contexts', true);
  await pa.getByRole('button', { name: 'Set priority', exact: true }).click(); await pa.getByRole('status').filter({ hasText: 'Set priority: gather: done' }).waitFor();
  await pb.reload(); await pb.getByText('Orders', { exact: true }).waitFor({ state: 'hidden' });
  check('shared: orders persist and other visitor cannot give orders', game.world.agents[0].priority === 'gather' && await pb.getByRole('button', { name: 'Set priority', exact: true }).count() === 0);
  await pa.reload(); await pa.getByRole('button', { name: 'Release', exact: true }).waitFor(); check('shared: browser session resumes after reload', true);
  await snap(pa, 'shared-profile-390');
  const previousTick = game.world.tick; await ca.close(); await cb.close();
  // This is a short observation of the program scheduler, not a task wait requirement.
  await new Promise(r => setTimeout(r, 2100)); check('shared: scheduler advances with all browsers closed', game.world.tick > previousTick);
  const errorContext = await browser.newContext(); const errorPage = await errorContext.newPage(); watch(errorPage);
  await errorPage.goto(url + '#/council');
  await errorPage.route('**/session', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Service unavailable for this validation"}' }));
  await errorPage.getByLabel('World service URL').fill(apiUrl); await errorPage.getByRole('button', { name: 'Join shared world', exact: true }).click(); await errorPage.getByRole('alert').filter({ hasText: 'Unable to join' }).waitFor();
  check('shared: connection failure offers recovery', await errorPage.getByRole('button', { name: 'Use local world', exact: true }).isVisible());
  await errorPage.getByRole('button', { name: 'Use local world', exact: true }).click(); await errorPage.getByRole('link', { name: 'World', exact: true }).click();
  await errorPage.getByRole('button', { name: 'Adopt an inhabitant', exact: true }).waitFor(); check('shared: local recovery remains playable', true);
  await errorContext.close();
  check('no unexpected console errors', consoleErrors.every(m=>/^Failed to load resource: the server responded with a status of (409|503)/.test(m)));
  check('no uncaught script errors', errors.length === 0); check('no failed local export resources', resourceErrors.length === 0);
  await writeFile(join(out, 'results.json'), JSON.stringify({ checks: results.length, passed: results, errors, resourceErrors, consoleErrors }, null, 2));
  console.log(JSON.stringify({ checks: results.length, errors, resourceErrors, consoleErrors, screenshots: 'test/scratch/browser/' }));
} catch (error) { console.error(error); console.error({ checksPassed: results.length, errors, resourceErrors }); process.exitCode = 1; }
finally { await browser?.close(); await new Promise(r => api.close(r)); game.close(); await new Promise(r => server.close(r)); await rm(dataDir, { recursive: true, force: true }); }
