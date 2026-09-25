import { XlsxCells } from './xlsx-cells.interface.js';

export interface XlsxGrid {
  readonly rowCount: number;
  row(rowNumber: number): XlsxCells;
}
