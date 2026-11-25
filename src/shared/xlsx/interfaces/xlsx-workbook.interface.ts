import { XlsxGrid } from './xlsx-grid.interface.js';

export interface XlsxWorkbook {
  /** The sheet with this name, ignoring case and surrounding spaces; null when absent. */
  sheet(name: string): XlsxGrid | null;
  /** The first sheet of the workbook; null when it has none. */
  first(): XlsxGrid | null;
}
