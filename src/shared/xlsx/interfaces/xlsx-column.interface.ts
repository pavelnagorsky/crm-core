export interface XlsxColumn<T> {
  header: string;
  key: keyof T;
  width?: number;
}
