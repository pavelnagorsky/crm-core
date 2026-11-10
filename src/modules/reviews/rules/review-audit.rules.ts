import { Review } from '@prisma/client';
import { REVIEW_AUDIT_FIELDS } from '../../audit/fields/review.fields.js';
import { AuditFieldChange } from '../../audit/interfaces/audit-field-change.interface.js';
import {
  auditSnapshot,
  auditSnapshotChanges,
} from '../../audit/utils/audit-snapshot.js';

const FIELD_KEYS = REVIEW_AUDIT_FIELDS.map(
  (field) => field.key,
) as (keyof Review & string)[];

const snapshot = (review: Review | null) =>
  review
    ? auditSnapshot(review, FIELD_KEYS)
    : Object.fromEntries(FIELD_KEYS.map((key) => [key, null]));

/** `before` null means creation, `after` null means deletion. */
export function reviewAuditChanges(
  before: Review | null,
  after: Review | null,
): AuditFieldChange[] {
  return auditSnapshotChanges(snapshot(before), snapshot(after));
}
