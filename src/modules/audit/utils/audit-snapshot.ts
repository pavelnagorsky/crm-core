import { AuditFieldChange } from '../interfaces/audit-field-change.interface.js';
import { diffFields } from './diff-fields.js';

export function auditSnapshot<T extends object>(
  source: T,
  fields: readonly (keyof T & string)[],
): Record<string, string | null> {
  return Object.fromEntries(
    fields.map((field) => {
      const value = source[field];
      return [
        field,
        value == null
          ? null
          : value instanceof Date
            ? value.toISOString()
            : typeof value === 'object'
              ? JSON.stringify(value)
              : String(value),
      ];
    }),
  );
}

export function auditSnapshotChanges(
  before: Record<string, string | null>,
  after: Record<string, string | null>,
): AuditFieldChange[] {
  return diffFields(
    before,
    after,
    Object.keys(after).map((key) => ({ key })),
  );
}
