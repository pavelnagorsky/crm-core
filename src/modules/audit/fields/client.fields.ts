import type { Client } from '@prisma/client';
import type { FieldDescriptor } from '../utils/diff-fields.js';

export const CLIENT_AUDIT_FIELDS: FieldDescriptor<Client>[] = [
  { key: 'firstName' },
  { key: 'lastName' },
  { key: 'phone' },
  { key: 'email' },
  { key: 'birthDate', type: 'date' },
  { key: 'gender' },
  { key: 'notes' },
];
