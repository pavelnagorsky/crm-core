/** One data row of the product price sheet, as text. */
export interface ProductPriceSheetRow {
  /** The row number as in Excel (1 is the header). */
  row: number;
  id: string;
  price: string;
}
