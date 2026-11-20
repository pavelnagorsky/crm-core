import type { AuditLog } from '@prisma/client';
import { AuditEntity } from '../enums/audit-entity.enum.js';
import { AuditEvent } from '../enums/audit-event.enum.js';
import { AuditRenderer } from './audit.renderer.js';

function log(
  eventType: AuditEvent,
  payload: Record<string, unknown>,
): AuditLog {
  return { entityType: AuditEntity.ORDER, eventType, payload } as AuditLog;
}

const base = {
  operationId: 'op-1',
  bookingId: null,
  occurredAt: '2026-11-19T15:30:00.000Z',
  amountDue: '3000.00',
  currency: 'BYN',
  reason: null,
  orderReturnId: null,
  previousOperationId: null,
  previousParts: null,
};

describe('AuditRenderer payments', () => {
  const renderer = new AuditRenderer();
  renderer.onModuleInit();

  it('titles every payment event', () => {
    expect(renderer.eventTitle(AuditEvent.PAYMENT_RECORDED)).toBe(
      'Оплата записана',
    );
    expect(renderer.eventTitle(AuditEvent.PAYMENT_REPLACED)).toBe(
      'Оплата изменена',
    );
    expect(renderer.eventTitle(AuditEvent.PAYMENT_VOIDED)).toBe(
      'Операция оплаты аннулирована',
    );
    expect(renderer.eventTitle(AuditEvent.PAYMENT_REFUNDED)).toBe(
      'Деньги возвращены',
    );
  });

  it('renders a mixed payment by method', () => {
    const html = renderer.render(
      log(AuditEvent.PAYMENT_RECORDED, {
        ...base,
        operationType: 'PAYMENT',
        parts: [
          { method: 'CASH', amount: '1000.00' },
          { method: 'CARD', amount: '2000.00' },
        ],
      }),
    );
    expect(html).toContain('Записана оплата');
    expect(html).toContain('наличные 1000.00 + карта 2000.00');
    expect(html).toContain('BYN');
  });

  it('renders a replacement with the replaced parts', () => {
    const html = renderer.render(
      log(AuditEvent.PAYMENT_REPLACED, {
        ...base,
        operationType: 'PAYMENT',
        parts: [{ method: 'CARD', amount: '3000.00' }],
        previousOperationId: 'op-0',
        previousParts: [{ method: 'CASH', amount: '3000.00' }],
      }),
    );
    expect(html).toContain('Изменена оплата');
    expect(html).toContain('карта 3000.00');
    expect(html).toContain('Было:');
    expect(html).toContain('наличные 3000.00');
  });

  it('renders a voided refund with its reason', () => {
    const html = renderer.render(
      log(AuditEvent.PAYMENT_VOIDED, {
        ...base,
        operationType: 'REFUND',
        parts: [{ method: 'CARD', amount: '500.00' }],
        reason: 'Ошибка',
      }),
    );
    expect(html).toContain('Аннулирована запись возврата');
    expect(html).toContain('Причина: Ошибка');
  });
});
