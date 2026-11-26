/** Mirror of Prisma PriceRuleTargetType: what a price rule applies to. */
export enum PriceRuleTargetType {
  SERVICE = 'SERVICE',
  SERVICE_CATEGORY = 'SERVICE_CATEGORY',
  BUNDLE = 'BUNDLE',
  /** Product.id (a brand product). */
  PRODUCT = 'PRODUCT',
  /** ProductCategory.id. */
  PRODUCT_CATEGORY = 'PRODUCT_CATEGORY',
}
