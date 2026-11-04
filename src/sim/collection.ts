import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { COLLECTION_SIZE, genesisCollection, metadataFor, portraitSvg, visualPortrait } from './genesis';

export interface ManifestRow { tokenId: number; name: string; faction: string; rarity: string; role: string; dna: string; image: string; metadata: string; visualHash: string; valid: boolean; issues: string[] }

/** Builds every Genesis file plus a manifest whose validation is computed, not asserted. */
export function buildCollection() {
  const all = genesisCollection();
  const files: { path: string; content: string }[] = [];
  const rows: ManifestRow[] = [];
  const seenName = new Set<string>();
  const seenDna = new Set<string>();
  const seenSvg = new Set<string>();
  for (const g of all) {
    const svg = portraitSvg(g);
    const visualHash = createHash('sha256').update(visualPortrait(svg)).digest('hex');
    const meta = metadataFor(g);
    const issues: string[] = [];
    if (seenName.has(g.name)) issues.push('duplicate name');
    if (seenDna.has(g.dna)) issues.push('duplicate dna');
    if (seenSvg.has(visualHash)) issues.push('duplicate visible image');
    if (!svg.startsWith('<svg') || !svg.endsWith('</svg>')) issues.push('malformed svg');
    seenName.add(g.name); seenDna.add(g.dna); seenSvg.add(visualHash);
    files.push({ path: `genesis/images/${g.id}.svg`, content: svg });
    files.push({ path: `genesis/metadata/${g.id}.json`, content: JSON.stringify(meta) });
    rows.push({ tokenId: g.id, name: g.name, faction: g.faction, rarity: g.rarity, role: g.role, dna: g.dna, image: `images/${g.id}.svg`, metadata: `metadata/${g.id}.json`, visualHash, valid: issues.length === 0, issues });
  }
  const paths = new Set(['index.html', ...files.map((f) => f.path)]);
  for (const row of rows) {
    const path = `genesis/${row.metadata}`;
    const meta = JSON.parse(files.find((f) => f.path === path)!.content);
    const resolve = (ref: string) => posix.normalize(posix.join(posix.dirname(path), ref.split('#')[0]));
    if (!paths.has(resolve(meta.image))) row.issues.push('broken image reference from metadata directory');
    if (resolve(meta.external_url) !== 'index.html' || !paths.has(resolve(meta.external_url)) || !meta.external_url.endsWith(`#/inhabitant/${row.tokenId}`)) row.issues.push('broken profile reference from metadata directory');
    row.valid = row.issues.length === 0;
  }
  const manifest = {
    collection: 'Gods of IMD Genesis',
    size: rows.length,
    expectedSize: COLLECTION_SIZE,
    allValid: rows.length === COLLECTION_SIZE && seenSvg.size === COLLECTION_SIZE && rows.every((r) => r.valid),
    distinctVisualHashes: seenSvg.size,
    minted: false,
    note: 'Not minted. Manifest paths are relative to genesis/; metadata references resolve from genesis/metadata/. Resolve storage URIs using the approved export CID before marketplace publication.',
    tokens: rows,
  };
  files.push({ path: 'genesis/manifest.json', content: JSON.stringify(manifest) });
  return { files, manifest };
}
