import type { Client } from '@prisma/client';
import type { FieldDescriptor } from '../utils/diff-fields.js';

export const CLIENT_AUDIT_FIELDS: FieldDescriptor<Client>[] = [
  { key: 'firstName', labelRu: 'Имя' },
  { key: 'lastName', labelRu: 'Фамилия' },
  { key: 'phone', labelRu: 'Телефон' },
  { key: 'email', labelRu: 'Email' },
  { key: 'birthDate', labelRu: 'Дата рождения', format: (v) => (v ? new Date(v as string).toLocaleDateString('ru-RU') : '—') },
  { key: 'gender', labelRu: 'Пол' },
  { key: 'notes', labelRu: 'Заметки' },
];
