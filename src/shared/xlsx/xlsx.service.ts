import { PassThrough } from 'stream';
import { format } from 'date-fns';
import ExcelJS from 'exceljs';
import { XlsxBook } from './interfaces/xlsx-book.interface.js';
import { XlsxCells } from './interfaces/xlsx-cells.interface.js';
import { XlsxColumn } from './interfaces/xlsx-column.interface.js';
import { XlsxFile } from './interfaces/xlsx-file.interface.js';
import { XlsxGrid } from './interfaces/xlsx-grid.interface.js';
import { XlsxSheet } from './interfaces/xlsx-sheet.interface.js';

const OCTET_STREAM = 'application/octet-stream';
const SHEET_NAME_LIMIT = 31;
const INVALID_SHEET_CHARS = /[\\/*?:[\]]/g;

export class XlsxService {
  static readonly mimeType =
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  static isXlsx(file: { originalname: string; mimetype: string }): boolean {
    const name = file.originalname.toLowerCase();
    const mimeOk =
      file.mimetype === XlsxService.mimeType || file.mimetype === OCTET_STREAM;
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
    return XlsxService.write(`${basename}-${day}.xlsx`, (book) => {
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
    const stream = new PassThrough();
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream });
    const commits: Array<() => void> = [];
    const book: XlsxBook = {
      addSheet(name: string, fallback = 'Sheet'): XlsxSheet {
        const worksheet = workbook.addWorksheet(
          XlsxService.sheetName(name, fallback),
        );
        commits.push(() => worksheet.commit());
        return {
          setColumns(columns) {
            worksheet.columns = columns.map((column) => ({
              header: column.header,
              key: column.key,
              width: column.width ?? 20,
            }));
          },
          addRow(values) {
            const data = Array.isArray(values) ? [...values] : values;
            worksheet.addRow(data).commit();
          },
        };
      },
    };
    build(book);
    for (const commit of commits) commit();
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
              visit(XlsxService.cellText(cell.value), column);
            });
          },
          text(column: number) {
            return XlsxService.cellText(excelRow.getCell(column).value);
          },
        };
      },
    };
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
        return XlsxService.cellText(value.result as ExcelJS.CellValue);
      if ('text' in value && value.text != null)
        return XlsxService.cellText(value.text as ExcelJS.CellValue);
    }
    return String(value).trim();
  }
}
