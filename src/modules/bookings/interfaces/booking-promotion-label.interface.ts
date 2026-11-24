/** The promotion label of a catalog item on the booking page (docs/pricing-stage4-api.md). */
export interface BookingPromotionLabel {
  /** One promotion: its public name; several: "Скидки до N%". */
  label: string;
  promotionIds: string[];
}
