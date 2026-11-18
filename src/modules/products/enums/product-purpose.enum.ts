/**
 * Filter by what a product is used for. A product may serve both purposes,
 * so it matches both filters; omitting the filter returns every product.
 */
export enum ProductPurpose {
  SALE = 'SALE',
  INTERNAL = 'INTERNAL',
}
