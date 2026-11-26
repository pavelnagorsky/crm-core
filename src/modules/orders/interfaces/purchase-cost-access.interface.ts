/** Purchase prices are shown as numbers only to a user with Read(INVENTORY). */
export interface PurchaseCostAccess {
  canReadPurchaseCost: boolean;
}
