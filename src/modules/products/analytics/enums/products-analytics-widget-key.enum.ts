export enum ProductsAnalyticsWidgetKey {
  /**
   * Big number: product revenue minus captured cost of goods sold for confirmed product lines.
   * Cost comes from `OrderItem.lineCostSnapshot`; missing cost snapshots count as zero.
   * Currency is `meta.currency`. `metric.spark` is gross profit per bucket. More is better.
   */
  GROSS_PROFIT = 'GROSS_PROFIT',

  /**
   * Big number: confirmed product revenue as a percent of completed-service revenue plus
   * confirmed product revenue. Standalone product orders are included. More is better.
   */
  PRODUCT_REVENUE_SHARE = 'PRODUCT_REVENUE_SHARE',

  /**
   * Big number: identified clients whose in-period product purchase was not their first product
   * purchase, divided by all identified product buyers in the period. Anonymous orders are
   * excluded from both sides. More is better.
   */
  REPEAT_PURCHASE_RATE = 'REPEAT_PURCHASE_RATE',
}
