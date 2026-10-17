export interface FieldDescriptor<T> {
  key: keyof T;
  type?: 'date' | 'datetime';
  /** Locale dictionary used to translate stored enum values, e.g. `staffStatus`. */
  i18n?: string;
  format?: (v: unknown) => string;
}
