import { XlsxCellValue } from './xlsx-cell-value.interface.js';
import { XlsxCells } from './xlsx-cells.interface.js';

export interface XlsxRow extends XlsxCells {
  /** 1-based row number in the sheet, as Excel shows it. */
  readonly number: number;
  /** Date cells hold the wall-clock time as a UTC moment: read them with UTC getters. */
  value(column: number): XlsxCellValue;
}
