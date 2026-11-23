/**
 * Builds the review import template and uploads it as a public file to the public bucket of every
 * environment configured on this machine, in one run:
 *   stage:      .env             + secrets/google-credentials.json            -> crm-clients-bucket
 *   production: .env.production  + secrets/google-credentials.production.json -> klendo-prod-public
 * An environment is skipped when its env file or key is missing.
 *
 * Re-run after changing the template (`scripts/reviews-import-template.ts`) or the
 * import columns and rules, otherwise the frontend keeps serving the old file.
 *
 *   npm run template:reviews-import                 build and upload
 *   npm run template:reviews-import -- --out <path> only write the file locally
 *
 * Each env file must define GOOGLE_BUCKET_NAME (and GOOGLE_PROJECT_ID).
 */
import { Storage } from '@google-cloud/storage';
import { parse } from 'dotenv';
import { existsSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { buffer } from 'node:stream/consumers';
import { XlsxUtils } from '../src/shared/xlsx/xlsx.utils.js';
import {
  REVIEWS_IMPORT_TEMPLATE_FILENAME,
  buildReviewsImportTemplate,
} from './reviews-import-template.js';

const OBJECT_PATH = `internal/${REVIEWS_IMPORT_TEMPLATE_FILENAME}`;
const CACHE_CONTROL = 'public, max-age=3600';
const TARGETS = [
  { name: 'stage', envFile: '.env', keyFile: 'secrets/google-credentials.json' },
  {
    name: 'production',
    envFile: '.env.production',
    keyFile: 'secrets/google-credentials.production.json',
  },
];

async function main(): Promise<void> {
  const content = await buffer(buildReviewsImportTemplate().stream);

  const outIndex = process.argv.indexOf('--out');
  if (outIndex !== -1) {
    const path = process.argv[outIndex + 1] ?? REVIEWS_IMPORT_TEMPLATE_FILENAME;
    await writeFile(path, content);
    console.log(`Written ${path} (${content.length} bytes)`);
    return;
  }

  let uploaded = 0;
  for (const target of TARGETS) {
    if (!existsSync(target.envFile) || !existsSync(target.keyFile)) {
      console.log(`Skipped ${target.name}: ${target.envFile} or ${target.keyFile} is missing`);
      continue;
    }
    const env = parse(readFileSync(target.envFile));
    const bucketName = env['GOOGLE_BUCKET_NAME'];
    if (!bucketName) throw new Error(`GOOGLE_BUCKET_NAME is not set in ${target.envFile}`);
    const storage = new Storage({
      projectId: env['GOOGLE_PROJECT_ID'],
      keyFilename: target.keyFile,
    });
    await storage
      .bucket(bucketName)
      .file(OBJECT_PATH)
      .save(content, {
        contentType: XlsxUtils.mimeType,
        metadata: { cacheControl: CACHE_CONTROL },
        resumable: false,
      });
    uploaded++;
    console.log(
      `${target.name}: uploaded https://storage.googleapis.com/${bucketName}/${OBJECT_PATH} (${content.length} bytes)`,
    );
  }
  if (uploaded === 0) throw new Error('No environment to upload to');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
