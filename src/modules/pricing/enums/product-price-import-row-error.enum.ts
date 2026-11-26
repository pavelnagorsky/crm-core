/** A problem of one row of the product price file; the texts live in the frontend. */
export enum ProductPriceImportRowError {
  ID_REQUIRED = 'ID_REQUIRED',
  ID_NOT_FOUND = 'ID_NOT_FOUND',
  DUPLICATE_ID = 'DUPLICATE_ID',
  NOT_FOR_SALE = 'NOT_FOR_SALE',
  PRICE_INVALID = 'PRICE_INVALID',
}
