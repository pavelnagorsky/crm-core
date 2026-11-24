import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import { projectRoot } from './vitest.root.js';

export default defineConfig({
  root: projectRoot,
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`.
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: projectRoot,
    include: ['**/*.spec.ts'],
  },
});
