import type { AuditLog } from '@prisma/client';
import { AuditEntity } from '../enums/audit-entity.enum.js';
import { AuditEvent } from '../enums/audit-event.enum.js';
import { AuditRendererService } from './audit-renderer.service.js';

function log(partial: Pick<AuditLog, 'entityType' | 'eventType' | 'payload'>): AuditLog {
  return partial as AuditLog;
}

describe('AuditRendererService payroll labels', () => {
  const renderer = new AuditRendererService();
  renderer.onModuleInit();

  it('translates a manual CORRECTION earning', () => {
    const html = renderer.render(
      log({
        entityType: AuditEntity.STAFF,
        eventType: AuditEvent.STAFF_EARNING_ADDED,
        payload: { type: 'CORRECTION', amount: '-10.00', currency: 'RUB', reason: 'ошибка' },
      }),
    );

    expect(html).toBe('<p>Корректировка: -10.00 RUB — ошибка</p>');
  });

  it('translates every earning type', () => {
    const types = [
      ['SERVICE_COMMISSION', 'Комиссия с услуги'],
      ['PRODUCT_COMMISSION', 'Комиссия с товара'],
      ['HOURLY', 'Почасовая оплата'],
      ['FIXED_SALARY', 'Оклад'],
      ['BONUS', 'Бонус'],
      ['DEDUCTION', 'Удержание'],
      ['CORRECTION', 'Корректировка'],
    ] as const;

    for (const [type, label] of types) {
      const html = renderer.render(
        log({
          entityType: AuditEntity.STAFF,
          eventType: AuditEvent.STAFF_EARNING_ADDED,
          payload: { type, amount: '1.00', currency: 'RUB' },
        }),
      );
      expect(html).toBe(`<p>${label}: 1.00 RUB</p>`);
    }
  });

  it('translates a payroll correction when the stored payload has no type', () => {
    const html = renderer.render(
      log({
        entityType: AuditEntity.PAYROLL,
        eventType: AuditEvent.PAYROLL_CORRECTED,
        payload: { amount: '15.00', currency: 'RUB', reason: 'доплата' },
      }),
    );

    expect(html).toBe('<p>Корректировка: 15.00 RUB — доплата</p>');
  });

  it('translates compensation fields and salary mode', () => {
    const html = renderer.render(
      log({
        entityType: AuditEntity.STAFF,
        eventType: AuditEvent.STAFF_COMPENSATION_UPDATED,
        payload: {
          effectiveFrom: '2026-10-01',
          serviceCommissionPercent: '10',
          productCommissionPercent: '5',
          fixedSalaryAmount: '40000',
          hourlyRate: '20',
          salaryMode: 'ADDITIVE',
          currency: 'RUB',
        },
      }),
    );

    expect(html).toContain('Действует с 2026-10-01');
    expect(html).toContain('Процент с услуг 10');
    expect(html).toContain('Процент с товаров 5');
    expect(html).toContain('Оклад 40000 RUB');
    expect(html).toContain('Почасовая ставка 20 RUB');
    expect(html).toContain('Режим оклада Оклад добавляется к начислениям');
    expect(html).not.toContain('ADDITIVE');
  });

  it('describes a shift range update', () => {
    const html = renderer.render(
      log({
        entityType: AuditEntity.STAFF,
        eventType: AuditEvent.STAFF_SHIFTS_UPDATED,
        payload: { startDate: '2026-10-01', endDate: '2026-10-31' },
      }),
    );

    expect(html).toBe('<p>Изменён рабочий график в диапазоне 2026-10-01 — 2026-10-31</p>');
  });

  it('describes a staff block', () => {
    const html = renderer.render(
      log({
        entityType: AuditEntity.STAFF,
        eventType: AuditEvent.STAFF_BLOCK_CREATED,
        payload: {
          startDateTime: '2026-10-01T09:00:00',
          endDateTime: '2026-10-01T12:00:00',
          title: 'Обед',
          reason: null,
        },
      }),
    );

    expect(html).toContain('09:00');
    expect(html).toContain('12:00');
    expect(html).toContain('Обед');
  });
});
