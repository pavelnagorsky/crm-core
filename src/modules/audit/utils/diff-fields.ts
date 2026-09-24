import { AuditFieldChange } from '../interfaces/audit-payload.interface.js';

export type FieldType = 'date' | 'datetime';

export interface FieldDescriptor<T> {
  key: keyof T;
  type?: FieldType;
  /** Locale dictionary used to translate stored enum values, e.g. `staffStatus`. */
  i18n?: string;
  format?: (v: unknown) => string;
}

const defaultFormat = (v: unknown): string => {
  if (v == null) return '—';
  if (v instanceof Date) return v.toISOString();
  return String(v);
};

export function diffFields<T>(old: T, updated: T, fields: FieldDescriptor<T>[]): AuditFieldChange[] {
  const changes: AuditFieldChange[] = [];
  for (const { key, format } of fields) {
    if (String(old[key] ?? '') !== String(updated[key] ?? '')) {
      const fmt = format ?? defaultFormat;
      changes.push({ field: String(key), from: fmt(old[key]), to: fmt(updated[key]) });
    }
  }
  return changes;
}
