import { COLLECTION_SIZE, genesisCollection, metadataFor, portraitSvg } from './genesis';

export interface ManifestRow { tokenId: number; name: string; faction: string; rarity: string; role: string; dna: string; image: string; metadata: string; valid: boolean; issues: string[] }

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
    const meta = metadataFor(g);
    const issues: string[] = [];
    if (seenName.has(g.name)) issues.push('duplicate name');
    if (seenDna.has(g.dna)) issues.push('duplicate dna');
    if (seenSvg.has(svg)) issues.push('duplicate image');
    if (!svg.startsWith('<svg') || !svg.endsWith('</svg>')) issues.push('malformed svg');
    if (meta.image !== `images/${g.id}.svg`) issues.push('broken image reference');
    seenName.add(g.name); seenDna.add(g.dna); seenSvg.add(svg);
    files.push({ path: `genesis/images/${g.id}.svg`, content: svg });
    files.push({ path: `genesis/metadata/${g.id}.json`, content: JSON.stringify(meta) });
    rows.push({ tokenId: g.id, name: g.name, faction: g.faction, rarity: g.rarity, role: g.role, dna: g.dna, image: `images/${g.id}.svg`, metadata: `metadata/${g.id}.json`, valid: issues.length === 0, issues });
  }
  const manifest = {
    collection: 'Gods of IMD Genesis',
    size: rows.length,
    expectedSize: COLLECTION_SIZE,
    allValid: rows.length === COLLECTION_SIZE && rows.every((r) => r.valid),
    minted: false,
    note: 'Not minted. Image URIs are relative to genesis/ and become ipfs:// URIs once the owner approves the collection and the export CID is fixed.',
    tokens: rows,
  };
  files.push({ path: 'genesis/manifest.json', content: JSON.stringify(manifest) });
  return { files, manifest };
}
