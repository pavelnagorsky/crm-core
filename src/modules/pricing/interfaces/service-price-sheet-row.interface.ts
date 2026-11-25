/** One non-empty row of the sheet "Цены", cells as trimmed text. */
export interface ServicePriceSheetRow {
  row: number;
  id: string;
  category: string;
  type: string;
  title: string;
  duration: string;
  price: string;
  description: string;
  /** Aligned with `ServicePricesSheet.levelColumns`. */
  levels: string[];
}
