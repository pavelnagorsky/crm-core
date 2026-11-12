/**
 * Builds the review import template and uploads it to GCS as a public file:
 * https://storage.googleapis.com/crm-clients-bucket/internal/reviews-import-template.xlsx
 *
 * Re-run after changing the template (`scripts/reviews-import-template.ts`) or the
 * import columns and rules, otherwise the frontend keeps serving the old file.
 *
 *   npm run template:reviews-import                 build and upload
 *   npm run template:reviews-import -- --out <path> only write the file locally
 *
 * Upload needs GOOGLE_APPLICATION_CREDENTIALS and GOOGLE_BUCKET_NAME from `.env`.
 */
import { Storage } from '@google-cloud/storage';
import { writeFile } from 'node:fs/promises';
import { buffer } from 'node:stream/consumers';
import { XlsxUtils } from '../src/shared/xlsx/xlsx.utils.js';
import {
  REVIEWS_IMPORT_TEMPLATE_FILENAME,
  buildReviewsImportTemplate,
} from './reviews-import-template.js';

const OBJECT_PATH = `internal/${REVIEWS_IMPORT_TEMPLATE_FILENAME}`;
const CACHE_CONTROL = 'public, max-age=3600';

async function main(): Promise<void> {
  const content = await buffer(buildReviewsImportTemplate().stream);

  const outIndex = process.argv.indexOf('--out');
  if (outIndex !== -1) {
    const path = process.argv[outIndex + 1] ?? REVIEWS_IMPORT_TEMPLATE_FILENAME;
    await writeFile(path, content);
    console.log(`Written ${path} (${content.length} bytes)`);
    return;
  }

  const bucketName = process.env['GOOGLE_BUCKET_NAME'];
  if (!bucketName) throw new Error('GOOGLE_BUCKET_NAME is not set');
  const storage = new Storage({ projectId: process.env['GOOGLE_PROJECT_ID'] });
  await storage
    .bucket(bucketName)
    .file(OBJECT_PATH)
    .save(content, {
      contentType: XlsxUtils.mimeType,
      metadata: { cacheControl: CACHE_CONTROL },
      resumable: false,
    });
  console.log(
    `Uploaded https://storage.googleapis.com/${bucketName}/${OBJECT_PATH} (${content.length} bytes)`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
