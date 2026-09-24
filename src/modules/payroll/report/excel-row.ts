import ExcelJS from 'exceljs';

export function addRow(sheet: ExcelJS.Worksheet, values: unknown[]): void {
  sheet.addRow(values).commit();
}
