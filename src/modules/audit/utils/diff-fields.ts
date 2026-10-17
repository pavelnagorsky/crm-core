import { AuditFieldChange } from '../interfaces/audit-field-change.interface.js';
import { FieldDescriptor } from '../interfaces/field-descriptor.interface.js';

export type FieldType = 'date' | 'datetime';

const defaultFormat = (v: unknown): string => {
  if (v == null) return '—';
  if (v instanceof Date) return v.toISOString();
  return String(v);
};

export function diffFields<T>(
  old: T,
  updated: T,
  fields: FieldDescriptor<T>[],
): AuditFieldChange[] {
  const changes: AuditFieldChange[] = [];
  for (const { key, format } of fields) {
    if (String(old[key] ?? '') !== String(updated[key] ?? '')) {
      const fmt = format ?? defaultFormat;
      changes.push({
        field: String(key),
        from: fmt(old[key]),
        to: fmt(updated[key]),
      });
    }
  }
  return changes;
}
