import { format } from 'date-fns';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { PassThrough } from 'stream';
import { XlsxBook } from './interfaces/xlsx-book.interface.js';
import { XlsxCellValue } from './interfaces/xlsx-cell-value.interface.js';
import { XlsxCells } from './interfaces/xlsx-cells.interface.js';
import { XlsxColumn } from './interfaces/xlsx-column.interface.js';
import { XlsxFile } from './interfaces/xlsx-file.interface.js';
import { XlsxGrid } from './interfaces/xlsx-grid.interface.js';
import { XlsxRow } from './interfaces/xlsx-row.interface.js';
import { XlsxSheet } from './interfaces/xlsx-sheet.interface.js';

const OCTET_STREAM = 'application/octet-stream';
const SHEET_NAME_LIMIT = 31;
const INVALID_SHEET_CHARS = /[\\/*?:[\]]/g;
const DEFAULT_COLUMN_WIDTH = 20;
const MIN_COLUMN_WIDTH = 10;
const MAX_COLUMN_WIDTH = 255;
const COLUMN_PADDING = 2;
const WORKBOOK_PATH = 'xl/workbook.xml';
const WORKBOOK_RELS_PATH = 'xl/_rels/workbook.xml.rels';
const SHARED_STRINGS_PATH = 'xl/sharedStrings.xml';
const STYLES_PATH = 'xl/styles.xml';
const WORKSHEET_PATH = /^xl\/worksheets\/sheet(\d+)\.xml$/;
const EMPTY_SHARED_STRINGS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="0" uniqueCount="0"/>';

type XlsxStoredColumn = { header: string; key: string; width?: number };
type XlsxStoredRow = unknown[] | Record<string, unknown>;
type XlsxStoredSheet = {
  name: string;
  columns: XlsxStoredColumn[] | null;
  rows: XlsxStoredRow[];
};

export class XlsxUtils {
  static readonly mimeType =
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  static isXlsx(file: { originalname: string; mimetype: string }): boolean {
    const name = file.originalname.toLowerCase();
    const mimeOk =
      file.mimetype === XlsxUtils.mimeType || file.mimetype === OCTET_STREAM;
    return name.endsWith('.xlsx') && mimeOk;
  }

  /** One sheet of columns and rows. Filename is `${basename}-YYYY-MM-DD.xlsx`. */
  static table<T extends Record<string, unknown>>(
    rows: readonly T[],
    columns: readonly XlsxColumn<T>[],
    basename: string,
    name = basename,
  ): XlsxFile {
    const day = new Date().toISOString().slice(0, 10);
    return XlsxUtils.write(`${basename}-${day}.xlsx`, (book) => {
      const sheet = book.addSheet(name);
      sheet.setColumns(
        columns.map((column) => ({
          header: column.header,
          key: String(column.key),
          width: column.width,
        })),
      );
      for (const row of rows) sheet.addRow(row);
    });
  }

  /** Streaming workbook. `filename` is the download name, including `.xlsx`. */
  static write(filename: string, build: (book: XlsxBook) => void): XlsxFile {
    const sheets: XlsxStoredSheet[] = [];
    const book: XlsxBook = {
      addSheet(name: string, fallback = 'Sheet'): XlsxSheet {
        const sheet: XlsxStoredSheet = {
          name: XlsxUtils.sheetName(name, fallback),
          columns: null,
          rows: [],
        };
        sheets.push(sheet);
        return {
          setColumns(columns) {
            sheet.columns = columns.map((column) => ({ ...column }));
          },
          addRow(values) {
            sheet.rows.push(
              Array.isArray(values) ? [...values] : { ...values },
            );
          },
        };
      },
    };
    build(book);

    const stream = new PassThrough();
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream });
    for (const sheet of sheets) {
      const worksheet = workbook.addWorksheet(sheet.name);
      const columns = XlsxUtils.columns(sheet);
      if (columns.length > 0) worksheet.columns = columns;
      for (const row of sheet.rows) worksheet.addRow(row).commit();
      worksheet.commit();
    }
    // Resolves only after the HTTP layer reads the stream. Awaiting it here deadlocks the response.
    void workbook.commit();
    return { stream, filename };
  }

  /** First worksheet as text cells, or null when the buffer is not a workbook. */
  static async read(buffer: Buffer): Promise<XlsxGrid | null> {
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(
        buffer as unknown as Parameters<ExcelJS.Xlsx['load']>[0],
      );
    } catch {
      return null;
    }
    const worksheet = workbook.worksheets[0];
    if (!worksheet) return null;
    return {
      rowCount: worksheet.rowCount,
      row(rowNumber: number): XlsxCells {
        const excelRow = worksheet.getRow(rowNumber);
        return {
          each(visit) {
            excelRow.eachCell({ includeEmpty: false }, (cell, column) => {
              visit(XlsxUtils.cellText(cell.value), column);
            });
          },
          text(column: number) {
            return XlsxUtils.cellText(excelRow.getCell(column).value);
          },
        };
      },
    };
  }

  /**
   * Streams the first worksheet one row at a time; empty rows are skipped.
   * Throws while iterating when the buffer is not a readable workbook.
   */
  static async *rows(buffer: Buffer): AsyncGenerator<XlsxRow> {
    const reader = new ExcelJS.stream.xlsx.WorkbookReader(
      await XlsxUtils.streamableParts(buffer),
      {
        sharedStrings: 'cache',
        // Cached styles carry number formats, so date cells arrive as Date values.
        styles: 'cache',
        hyperlinks: 'ignore',
        worksheets: 'emit',
        entries: 'ignore',
      },
    );
    for await (const worksheet of reader) {
      for await (const excelRow of worksheet as AsyncIterable<ExcelJS.Row>) {
        yield {
          number: excelRow.number,
          each(visit) {
            excelRow.eachCell({ includeEmpty: false }, (cell, column) => {
              visit(XlsxUtils.cellText(cell.value), column);
            });
          },
          text(column: number) {
            return XlsxUtils.cellText(excelRow.getCell(column).value);
          },
          value(column: number) {
            return XlsxUtils.cellValue(excelRow.getCell(column).value);
          },
        };
      }
      return;
    }
  }

  /**
   * The parts the stream reader needs, re-packed so the first worksheet comes last and shared
   * strings always exist. Excel and ExcelJS store worksheets before shared strings; the reader
   * then spills the sheet to a temp file, and under load the zip iteration ends early and
   * silently drops the remaining parts.
   */
  private static async streamableParts(buffer: Buffer): Promise<PassThrough> {
    const source = await JSZip.loadAsync(buffer);
    const sheetPath = Object.keys(source.files)
      .map((path) => ({ path, match: WORKSHEET_PATH.exec(path) }))
      .filter(({ match }) => match)
      .sort((a, b) => Number(a.match?.[1]) - Number(b.match?.[1]))[0]?.path;
    const rels = source.file(WORKBOOK_RELS_PATH);
    const workbook = source.file(WORKBOOK_PATH);
    if (!sheetPath || !rels || !workbook)
      throw new Error('Workbook has no worksheet');

    const parts = new JSZip();
    parts.file(WORKBOOK_RELS_PATH, rels.nodeStream());
    parts.file(WORKBOOK_PATH, workbook.nodeStream());
    parts.file(
      SHARED_STRINGS_PATH,
      source.file(SHARED_STRINGS_PATH)?.nodeStream() ?? EMPTY_SHARED_STRINGS,
    );
    const styles = source.file(STYLES_PATH);
    if (styles) parts.file(STYLES_PATH, styles.nodeStream());
    parts.file(sheetPath, source.files[sheetPath].nodeStream());
    // JSZip streams come from `readable-stream`, which ExcelJS does not accept as a Stream.
    return parts
      .generateNodeStream({ compression: 'STORE', streamFiles: true })
      .pipe(new PassThrough());
  }

  private static sheetName(name: string, fallback: string): string {
    const cleaned = name.replace(INVALID_SHEET_CHARS, ' ').trim() || fallback;
    return cleaned.slice(0, SHEET_NAME_LIMIT);
  }

  private static cellText(value: ExcelJS.CellValue): string {
    if (value == null) return '';
    if (value instanceof Date) return format(value, 'yyyy-MM-dd');
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean')
      return String(value).trim();
    if (typeof value === 'object') {
      if ('richText' in value && Array.isArray(value.richText)) {
        return value.richText
          .map((part) => part.text)
          .join('')
          .trim();
      }
      if ('result' in value)
        return XlsxUtils.cellText(value.result as ExcelJS.CellValue);
      if ('text' in value && value.text != null)
        return XlsxUtils.cellText(value.text as ExcelJS.CellValue);
    }
    return String(value).trim();
  }

  private static cellValue(value: ExcelJS.CellValue): XlsxCellValue {
    if (value == null) return null;
    if (
      value instanceof Date ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    )
      return value;
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'object') {
      if ('error' in value) return null;
      if ('result' in value)
        return XlsxUtils.cellValue(value.result as ExcelJS.CellValue);
    }
    return XlsxUtils.cellText(value);
  }

  private static contentWidth(value: unknown): number {
    const text = XlsxUtils.cellText(value as ExcelJS.CellValue);
    if (!text) return 0;
    return text.split(/\r\n|\r|\n/).reduce((max, line) => {
      return Math.max(max, Array.from(line).length);
    }, 0);
  }

  private static columnWidth(width: number): number {
    return Math.min(
      MAX_COLUMN_WIDTH,
      Math.max(MIN_COLUMN_WIDTH, Math.ceil(width)),
    );
  }

  private static columns(sheet: XlsxStoredSheet): Partial<ExcelJS.Column>[] {
    return sheet.columns
      ? XlsxUtils.configuredColumns(sheet.columns, sheet.rows)
      : XlsxUtils.inferredColumns(sheet.rows);
  }

  private static configuredColumns(
    columns: readonly XlsxStoredColumn[],
    rows: readonly XlsxStoredRow[],
  ): Partial<ExcelJS.Column>[] {
    return columns.map((column) => ({
      header: column.header,
      key: column.key,
      width: XlsxUtils.fittedWidth(column.width ?? DEFAULT_COLUMN_WIDTH, [
        column.header,
        ...rows.map((row) => XlsxUtils.rowValue(row, column.key)),
      ]),
    }));
  }

  private static inferredColumns(
    rows: readonly XlsxStoredRow[],
  ): Partial<ExcelJS.Column>[] {
    const keys = XlsxUtils.inferredKeys(rows);
    const count =
      keys.length > 0
        ? keys.length
        : rows.reduce((max, row) => {
            return Array.isArray(row) ? Math.max(max, row.length) : max;
          }, 0);
    return Array.from({ length: count }, (_, index) => {
      const key = keys[index];
      return {
        key,
        width: XlsxUtils.fittedWidth(
          DEFAULT_COLUMN_WIDTH,
          rows.map((row) =>
            key ? XlsxUtils.rowValue(row, key) : XlsxUtils.rowValue(row, index),
          ),
        ),
      };
    });
  }

  private static inferredKeys(rows: readonly XlsxStoredRow[]): string[] {
    const keys: string[] = [];
    for (const row of rows) {
      if (Array.isArray(row)) continue;
      for (const key of Object.keys(row)) {
        if (!keys.includes(key)) keys.push(key);
      }
    }
    return keys;
  }

  private static rowValue(row: XlsxStoredRow, key: string | number): unknown {
    if (Array.isArray(row)) return typeof key === 'number' ? row[key] : '';
    const record: Record<string, unknown> = row;
    return typeof key === 'string' ? record[key] : Object.values(record)[key];
  }

  private static fittedWidth(
    baseWidth: number,
    values: readonly unknown[],
  ): number {
    const contentWidth = values.reduce<number>((max, value) => {
      return Math.max(max, XlsxUtils.contentWidth(value));
    }, 0);
    return XlsxUtils.columnWidth(
      Math.max(baseWidth, contentWidth + COLUMN_PADDING),
    );
  }
}
