export interface XlsxCells {
  each(visit: (text: string, column: number) => void): void;
  text(column: number): string;
}
