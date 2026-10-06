import { createPrismaClient } from './lib/db.mjs';
import {
  seed as hairSalonSeed,
  meta as hairSalonMeta,
} from './seeds/hair-salon.mjs';

// Registry of available seeds. Add new demo seeds here.
const SEEDS = {
  'hair-salon': { run: hairSalonSeed, meta: hairSalonMeta },
};

function printAvailable() {
  console.error('\nAvailable seeds:');
  for (const [key, { meta }] of Object.entries(SEEDS)) {
    console.error(`  ${key.padEnd(16)} ${meta?.description ?? ''}`);
  }
  console.error('\nUsage: node scripts/seed/run.mjs <seed-name>\n');
}

async function main() {
  const name = process.argv[2];
  if (!name) {
    console.error('Error: no seed name provided.');
    printAvailable();
    process.exit(1);
  }
  const entry = SEEDS[name];
  if (!entry) {
    console.error(`Error: unknown seed "${name}".`);
    printAvailable();
    process.exit(1);
  }

  const prisma = createPrismaClient();
  const startedAt = Date.now();
  console.log(`▶ Running seed "${name}" — ${entry.meta?.description ?? ''}`);
  try {
    await prisma.$connect();
    await entry.run(prisma);
    console.log(
      `\n✔ Seed "${name}" completed in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`,
    );
  } catch (err) {
    console.error(`\nx Seed "${name}" failed:`);
    console.error(err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
