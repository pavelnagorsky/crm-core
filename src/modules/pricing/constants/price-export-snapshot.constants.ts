/** The very hidden sheet of an exported price file with the prices as they were exported. */
export const PRICE_EXPORT_SHEET_NAME = 'klendo-export';
/** Format of the sheet; another value means a file without export data. */
export const PRICE_EXPORT_FORMAT = 'klendo-price-export/1';

/** Keys of the meta rows; price rows carry the key of the price cell. */
export const PRICE_EXPORT_META = {
  format: '@format',
  catalog: '@catalog',
  locationId: '@locationId',
  exportedAt: '@exportedAt',
} as const;
