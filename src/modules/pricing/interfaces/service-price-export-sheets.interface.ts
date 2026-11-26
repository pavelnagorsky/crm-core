/** Columns and rows of both sheets of the price file, ready for the workbook writer. */
export interface ServicePriceExportSheets {
  priceColumns: { header: string; key: string; width: number }[];
  priceRows: Record<string, unknown>[];
  staffColumns: { header: string; key: string; width: number }[];
  staffRows: Record<string, unknown>[];
  /** The exported price of every price cell by its key (see `PriceExportSnapshot`); null for the template. */
  exported: Map<string, string | null> | null;
}
