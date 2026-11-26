import { XlsxSheet } from './xlsx-sheet.interface.js';

export interface XlsxBook {
  addSheet(name: string, fallback?: string): XlsxSheet;
  /** A sheet for the app, not for people: very hidden (Excel has no command to show it) and protected. */
  addHiddenSheet(name: string): XlsxSheet;
}
