export enum ProductsAnalyticsWidgetKey {
  /**
   * Big number: product revenue minus captured cost of goods sold for confirmed product lines.
   * Cost comes from `OrderItem.lineCostSnapshot`; missing cost snapshots count as zero.
   * Currency is `meta.currency`. `metric.spark` is gross profit per bucket. More is better.
   */
  GROSS_PROFIT = 'GROSS_PROFIT',

  /**
   * Big number: filtered confirmed product revenue as a percent of all confirmed product
   * and completed-service revenue in the same location, period and staff scope.
   * Product/category filters apply only to the numerator. Standalone orders are included.
   */
  PRODUCT_REVENUE_SHARE = 'PRODUCT_REVENUE_SHARE',

  /**
   * Big number: identified clients whose in-period product purchase was not their first product
   * purchase, divided by all identified product buyers in the period. Anonymous orders are
   * excluded from both sides. Buyers are unique across selected locations; prior purchases
   * use the same location, product, category and staff filters. More is better.
   */
  REPEAT_PURCHASE_RATE = 'REPEAT_PURCHASE_RATE',
}
