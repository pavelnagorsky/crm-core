import { LocaleService } from './locale.service.js';

describe('LocaleService', () => {
  const locale = new LocaleService();
  locale.onModuleInit();

  it('loads Russian as the default locale', () => {
    const messages = locale.get();
    expect(messages.documents.payroll.vedomostTitle).toBe(
      'Ведомость на выплату',
    );
    expect(messages.documents.staff.sheet).toBe('Сотрудники');
    expect(messages.documents.bookings.sheet).toBe('Записи');
    expect(messages.documents.inventory.vedomostTitle).toBe(
      'Оборотная ведомость склада',
    );
    expect(messages.inventoryMovementType.SALE).toBe('Продажа');
    expect(messages.productUnit.PIECE).toBe('шт');
    expect(messages.bookingSource.MANUAL).toBe('Вручную');
    expect(messages.earningType.BONUS).toBe('Бонус');
    expect(messages.earningType.CORRECTION).toBe('Корректировка');
    expect(messages.salaryMode.GUARANTEED_MINIMUM).toBe(
      'Гарантированный минимум',
    );
    expect(messages.fields.PAYROLL.startDate).toBe('Начало');
    expect(messages.fields.STAFF.hourlyRate).toBe('Почасовая ставка');
  });

  it('falls back to Russian for an unknown language', () => {
    expect(locale.get('de').documents.payroll.payslipTitle).toBe(
      'Расчётный листок',
    );
  });
});
