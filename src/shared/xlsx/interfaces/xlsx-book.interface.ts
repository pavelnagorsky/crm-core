import { XlsxSheet } from './xlsx-sheet.interface.js';

export interface XlsxBook {
  addSheet(name: string, fallback?: string): XlsxSheet;
}
