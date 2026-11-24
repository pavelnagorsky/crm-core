/** What a past item is matched against: its service, category and bundle. */
export interface PromotionMatchTarget {
  serviceId: string;
  categoryId: string | null;
  bundleId: string | null;
}
