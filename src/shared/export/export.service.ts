import { PassThrough } from 'stream';
import ExcelJS from 'exceljs';

export type ExportColumn<T> = {
  header: string;
  key: keyof T;
  width?: number;
};

export type ExportResult = {
  stream: PassThrough;
  filename: string;
};

export class ExportService {
  static build<T extends Record<string, unknown>>(
    rows: T[],
    columns: ExportColumn<T>[],
    basename: string,
  ): ExportResult {
    const timestamp = new Date().toISOString().slice(0, 10);
    const stream = new PassThrough();

    ExportService.writeXlsx(rows, columns, stream, basename);
    return { stream, filename: `${basename}-${timestamp}.xlsx` };
  }

  private static writeXlsx<T extends Record<string, unknown>>(
    rows: T[],
    columns: ExportColumn<T>[],
    out: PassThrough,
    sheetName: string,
  ): void {
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: out });
    const sheet = workbook.addWorksheet(sheetName);

    sheet.columns = columns.map((c) => ({ header: c.header, key: c.key as string, width: c.width ?? 20 }));

    for (const row of rows) {
      sheet.addRow(row as Record<string, unknown>).commit();
    }

    sheet.commit();
    workbook.commit();
  }
}
