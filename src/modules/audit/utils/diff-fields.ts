import { AuditFieldChange } from '../interfaces/audit-payload.interface.js';

export interface FieldDescriptor<T> {
  key: keyof T;
  labelRu: string;
  format?: (v: unknown) => string;
}

const defaultFormat = (v: unknown): string => String(v ?? '—');

/**
 * Compares two entity snapshots and returns a list of changed fields
 * with human-readable Russian labels and formatted before/after values.
 */
export function diffFields<T>(old: T, updated: T, fields: FieldDescriptor<T>[]): AuditFieldChange[] {
  const changes: AuditFieldChange[] = [];
  for (const { key, labelRu, format } of fields) {
    if (String(old[key] ?? '') !== String(updated[key] ?? '')) {
      const fmt = format ?? defaultFormat;
      changes.push({ field: String(key), labelRu, from: fmt(old[key]), to: fmt(updated[key]) });
    }
  }
  return changes;
}
