import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import { projectRoot } from './vitest.root.js';

export default defineConfig({
  root: projectRoot,
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: projectRoot,
    include: ['**/*.e2e-spec.ts'],
    // Real-database specs run inside one transaction with a 30s timeout; a cold database
    // connection alone can take longer than the default 5s per test.
    testTimeout: 30_000,
  },
});
