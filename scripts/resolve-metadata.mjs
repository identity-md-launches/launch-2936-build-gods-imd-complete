// Prepare marketplace metadata after approval, using already-pinned artwork and a real public profile URL.
import { parseArgs } from 'node:util';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const { values } = parseArgs({ options: { 'artwork-base': { type: 'string' }, 'profile-base': { type: 'string' }, out: { type: 'string' } } });
if (!values['artwork-base'] || !values['profile-base'] || !values.out) throw new Error('Required: --artwork-base <ipfs://approved-CID/genesis/images/> --profile-base <public index.html URL> --out <output directory>');
const art = new URL(values['artwork-base'].replace(/\/?$/, '/'));
const profile = new URL(values['profile-base']);
if (!['ipfs:', 'https:'].includes(art.protocol) || !['ipfs:', 'https:'].includes(profile.protocol) || art.username || art.password || profile.username || profile.password) throw new Error('Use final IPFS or HTTPS storage URLs without credentials.');
const out = resolve(values.out);
if (out === resolve('dist') || out.startsWith(resolve('dist') + '/')) throw new Error('Write a separate metadata directory, preserving the static export.');
const manifest = JSON.parse(await readFile('dist/genesis/manifest.json', 'utf8'));
if (!manifest.allValid || manifest.size !== 1000 || manifest.distinctVisualHashes !== 1000) throw new Error('Build and validate the complete collection first.');
await mkdir(out, { recursive: true });
for (let id = 1; id <= 1000; id++) {
  const meta = JSON.parse(await readFile(`dist/genesis/metadata/${id}.json`, 'utf8'));
  meta.image = new URL(`${id}.svg`, art).href;
  profile.hash = `/inhabitant/${id}`;
  meta.external_url = profile.href;
  await writeFile(`${out}/${id}.json`, JSON.stringify(meta));
}
console.log('Prepared 1,000 metadata records using the supplied storage URIs. No publishing or minting was performed.');
