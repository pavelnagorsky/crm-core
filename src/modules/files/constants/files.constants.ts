export const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB

/** Public uploads are never overwritten (every upload gets a new key), so browsers may cache them for good. */
export const PUBLIC_FILE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/** Lifetime of a signed link to a private file. */
export const PRIVATE_FILE_URL_TTL_MS = 60 * 60 * 1000;
