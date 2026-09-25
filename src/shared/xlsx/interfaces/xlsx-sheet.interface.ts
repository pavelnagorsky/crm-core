export interface XlsxSheet {
  setColumns(columns: readonly { header: string; key: string; width?: number }[]): void;
  addRow(values: readonly unknown[] | Record<string, unknown>): void;
}
