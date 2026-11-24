/** Mirror of Prisma PromotionClientFilter: who a promotion is for. */
export enum PromotionClientFilter {
  ANY = 'ANY',
  NEW = 'NEW',
  /** Visit date within birthdayWindowDays of the birthday of the client. */
  BIRTHDAY = 'BIRTHDAY',
}
