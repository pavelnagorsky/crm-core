/** Mirror of Prisma PromotionLimitPeriod: window of the per-client limit, back from the visit date. */
export enum PromotionLimitPeriod {
  ALL_TIME = 'ALL_TIME',
  /** 365 days. */
  YEAR = 'YEAR',
  /** 30 days. */
  MONTH = 'MONTH',
  /** 7 days. */
  WEEK = 'WEEK',
}
