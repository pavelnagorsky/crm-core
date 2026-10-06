import type { AuditLog } from '@prisma/client';
import { AuditEntity } from '../enums/audit-entity.enum.js';
import { AuditEvent } from '../enums/audit-event.enum.js';
import { AuditRendererService } from './audit-renderer.service.js';

function log(
  partial: Pick<AuditLog, 'entityType' | 'eventType' | 'payload'>,
): AuditLog {
  return partial as AuditLog;
}

describe('AuditRendererService catalog and booking labels', () => {
  const renderer = new AuditRendererService();
  renderer.onModuleInit();

  it('renders a multi-service booking with source, mode and bundle', () => {
    const html = renderer.render(
      log({
        entityType: AuditEntity.BOOKING,
        eventType: AuditEvent.BOOKING_CREATED,
        payload: {
          bundleTitle: 'Комплекс',
          items: [
            { serviceName: 'Стрижка', staffName: 'Анна', price: '50.00' },
            { serviceName: 'Окрашивание', staffName: 'Борис', price: '80.00' },
          ],
          startTime: '2026-09-20T07:00:00.000Z',
          endTime: '2026-09-20T09:00:00.000Z',
          totalPrice: '130.00',
          currency: 'BYN',
          source: 'MANUAL',
          executionMode: 'PARALLEL',
        },
      }),
    );

    expect(html).toContain('Комплекс');
    expect(html).toContain('130.00 BYN');
    expect(html).toContain('Вручную');
    expect(html).toContain('Одновременно');
    expect(html).toContain('Стрижка — Анна, 50.00 BYN');
    expect(html).toContain('Окрашивание — Борис, 80.00 BYN');
  });

  it('keeps rendering a legacy single-service booking', () => {
    const html = renderer.render(
      log({
        entityType: AuditEntity.BOOKING,
        eventType: AuditEvent.BOOKING_CREATED,
        payload: {
          serviceName: 'Стрижка',
          staffName: 'Анна',
          startTime: '2026-09-20T07:00:00.000Z',
          endTime: '2026-09-20T08:00:00.000Z',
          price: '50.00',
          currency: 'BYN',
        },
      }),
    );

    expect(html).toContain('Стрижка с Анна');
    expect(html).toContain('50.00 BYN');
  });

  it('renders a staff change and a per-item price on a booking', () => {
    const html = renderer.render(
      log({
        entityType: AuditEntity.BOOKING,
        eventType: AuditEvent.BOOKING_UPDATED,
        payload: {
          currency: 'BYN',
          changes: [
            { field: 'staffName', from: 'Анна', to: 'Стрижка: Борис' },
            { field: 'customPrice', from: '—', to: 'Окрашивание: 60.00' },
          ],
        },
      }),
    );

    expect(html).toContain('Сотрудник');
    expect(html).toContain('Анна');
    expect(html).toContain('Стрижка: Борис');
    expect(html).toContain('Цена');
    expect(html).toContain('Окрашивание: 60.00 BYN');
  });

  it('renders service category, image and sort order changes', () => {
    const html = renderer.render(
      log({
        entityType: AuditEntity.SERVICE,
        eventType: AuditEvent.SERVICE_UPDATED,
        payload: {
          changes: [
            { field: 'categoryName', from: '—', to: 'Волосы' },
            { field: 'imageName', from: '—', to: 'cut.webp' },
            { field: 'sortOrder', from: '0', to: '2' },
          ],
        },
      }),
    );

    expect(html).toContain('Категория');
    expect(html).toContain('Волосы');
    expect(html).toContain('Изображение');
    expect(html).toContain('cut.webp');
    expect(html).toContain('Порядок');
  });

  it('renders a bundle price-mode change and a category deletion', () => {
    const bundle = renderer.render(
      log({
        entityType: AuditEntity.SERVICE,
        eventType: AuditEvent.SERVICE_BUNDLE_UPDATED,
        payload: {
          currency: 'BYN',
          changes: [
            { field: 'pricingMode', from: 'SUM', to: 'FIXED' },
            { field: 'fixedPrice', from: '—', to: '100.00' },
            {
              field: 'items',
              from: 'Стрижка, Окрашивание',
              to: 'Окрашивание, Стрижка',
            },
          ],
        },
      }),
    );
    const category = renderer.render(
      log({
        entityType: AuditEntity.SERVICE,
        eventType: AuditEvent.SERVICE_CATEGORY_DELETED,
        payload: { name: 'Волосы' },
      }),
    );

    expect(bundle).toContain('Расчёт цены');
    expect(bundle).toContain('Сумма услуг');
    expect(bundle).toContain('Фиксированная цена');
    expect(bundle).toContain('100.00 BYN');
    expect(bundle).toContain('Состав');
    expect(category).toContain('Волосы');
    expect(renderer.eventTitle(AuditEvent.SERVICE_BUNDLE_CREATED)).toBe(
      'Комплекс создан',
    );
    expect(renderer.eventTitle(AuditEvent.SERVICE_CATEGORY_CREATED)).toBe(
      'Категория услуг создана',
    );
  });
});
