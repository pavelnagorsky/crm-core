/**
 * Russian labels for all enum values used across the app.
 * Single source of truth — update here to affect UI, audit, emails, etc.
 */

export const BookingStatusLabels: Record<string, string> = {
  PENDING: 'Ожидает подтверждения',
  CONFIRMED: 'Подтверждено',
  CANCELLED: 'Отменено',
  COMPLETED: 'Завершено',
  NO_SHOW: 'Не явился',
};

export const CancelledByLabels: Record<string, string> = {
  BUSINESS: 'бизнес',
  CLIENT: 'клиент',
};

export const AuditActorRoleLabels: Record<string, string> = {
  CLIENT: 'клиент',
  STAFF: 'менеджер',
  OWNER: 'владелец',
  SYSTEM: 'система',
};
