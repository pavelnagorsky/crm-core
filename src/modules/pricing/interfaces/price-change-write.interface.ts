/** One price to store for a change row; null removes a level or personal price. */
export interface PriceChangeWrite {
  itemId: string;
  price: number | null;
}
