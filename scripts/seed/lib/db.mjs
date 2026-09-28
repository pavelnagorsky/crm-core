import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..', '..', '..');

/**
 * Minimal .env reader — avoids adding a `dotenv` dependency the project does not have.
 * Only parses `KEY=VALUE` lines, strips surrounding quotes, ignores comments/blank lines.
 */
function loadEnv() {
  const path = resolve(projectRoot, '.env');
  const text = readFileSync(path, 'utf8');
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

/**
 * Creates a PrismaClient wired through the pg adapter, mirroring
 * src/database/database.service.ts. Reads DATABASE_URL from the project .env.
 */
export function createPrismaClient() {
  const env = loadEnv();
  const connectionString = env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set in .env');
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}
