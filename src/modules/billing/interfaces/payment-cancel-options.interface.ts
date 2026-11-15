/** brandId: the owner may cancel only a payment of this brand. */
export interface PaymentCancelOptions {
  brandId?: string;
  adminNote?: string | null;
}
