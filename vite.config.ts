import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { buildCollection } from './src/sim/collection';

// Emits the 1,000 Genesis metadata files, portraits and the validated manifest into dist/genesis/.
function genesisCollection(): Plugin {
  return {
    name: 'genesis-collection',
    apply: 'build',
    generateBundle() {
      const { files } = buildCollection();
      for (const f of files) this.emitFile({ type: 'asset', fileName: f.path, source: f.content });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), genesisCollection()],
  build: { outDir: 'dist', emptyOutDir: true, assetsInlineLimit: 0 },
  test: { include: ['tests/**/*.test.ts'] },
} as never);
