import type { Review } from '@prisma/client';
import type { FieldDescriptor } from '../interfaces/field-descriptor.interface.js';

export const REVIEW_AUDIT_FIELDS: FieldDescriptor<Review>[] = [
  { key: 'rating' },
  { key: 'text' },
  { key: 'status' },
  { key: 'hiddenReason' },
  { key: 'replyText' },
];
