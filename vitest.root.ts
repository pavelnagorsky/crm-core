import { fileURLToPath } from 'node:url';

/**
 * The project directory with the drive letter as Windows reports it (`D:`), whatever case the shell or editor
 * started in. Node resolves `node_modules` through the real path, so a root of `d:\...` makes Vitest load a second
 * copy of `vitest` and of mocked packages: `describe` imported from 'vitest' has no runner and `vi.mock` misses.
 */
const dir = fileURLToPath(new URL('.', import.meta.url));
export const projectRoot = dir.charAt(0).toUpperCase() + dir.slice(1);
