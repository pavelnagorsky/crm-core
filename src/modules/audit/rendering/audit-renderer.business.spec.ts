import { AuditEntity, AuditEvent, AuditLog } from '@prisma/client';
import { AuditRenderer } from './audit.renderer.js';

function log(
  partial: Pick<AuditLog, 'entityType' | 'eventType' | 'payload'>,
): AuditLog {
  return {
    id: 'audit-1',
    brandId: 'brand-1',
    locationId: null,
    entityId: 'entity-1',
    actionType: 'ACTION',
    occurredAt: new Date(),
    createdAt: new Date(),
    actorId: 'user-1',
    actorName: 'Anna',
    actorRole: 'OWNER',
    ...partial,
  };
}

describe('AuditRenderer brand and location lifecycle', () => {
  const renderer = new AuditRenderer();
  renderer.onModuleInit();

  it.each([
    [AuditEntity.BRAND, AuditEvent.BRAND_CREATED, 'Бренд создан'],
    [AuditEntity.BRAND, AuditEvent.BRAND_DELETED, 'Бренд удалён'],
    [AuditEntity.LOCATION, AuditEvent.LOCATION_CREATED, 'Локация создана'],
    [AuditEntity.LOCATION, AuditEvent.LOCATION_DELETED, 'Локация удалена'],
  ] as const)(
    'renders %s / %s with a readable title and escaped name',
    (entityType, eventType, title) => {
      const html = renderer.render(
        log({
          entityType,
          eventType,
          payload: { name: '<Studio>' },
        }),
      );
      expect(html).toBe('&lt;Studio&gt;');
      expect(renderer.eventTitle(eventType)).toBe(title);
    },
  );

  it('renders brand setting changes with field labels', () => {
    const html = renderer.render(
      log({
        entityType: AuditEntity.BRAND,
        eventType: AuditEvent.BRAND_UPDATED,
        payload: {
          changes: [
            { field: 'name', from: 'Old brand', to: 'New brand' },
            { field: 'logoFileId', from: '—', to: 'logo-1' },
          ],
        },
      }),
    );
    expect(html).toContain('Название');
    expect(html).toContain('Old brand');
    expect(html).toContain('New brand');
    expect(html).toContain('Логотип');
  });

  it('renders location settings with translated values and cleared contacts', () => {
    const html = renderer.render(
      log({
        entityType: AuditEntity.LOCATION,
        eventType: AuditEvent.LOCATION_UPDATED,
        payload: {
          changes: [
            { field: 'businessType', from: 'HAIR_SALON', to: 'BARBERSHOP' },
            { field: 'bookingVisibility', from: 'PUBLIC', to: 'PRIVATE' },
            {
              field: 'isBookingConfirmationRequired',
              from: 'false',
              to: 'true',
            },
            { field: 'phone', from: '+375291234567', to: '—' },
          ],
        },
      }),
    );
    expect(html).toContain('Тип бизнеса');
    expect(html).toContain('Парикмахерская');
    expect(html).toContain('Барбершоп');
    expect(html).toContain('Публичная');
    expect(html).toContain('Закрытая');
    expect(html).toContain('Нет');
    expect(html).toContain('Да');
    expect(html).toContain('Телефон');
    expect(html).toContain('—');
  });
});

describe('AuditRenderer extended history', () => {
  const renderer = new AuditRenderer();
  renderer.onModuleInit();

  it.each(['BOOKING_PAGE', 'BOOKING_WIDGET'] as const)(
    'renders %s publication and escapes titles',
    (entityType) => {
      const html = renderer.render(
        log({
          entityType,
          eventType:
            entityType === 'BOOKING_PAGE'
              ? AuditEvent.BOOKING_PAGE_STATUS_CHANGED
              : AuditEvent.BOOKING_WIDGET_STATUS_CHANGED,
          payload: {
            title: '<Channel>',
            changes: [{ field: 'status', from: 'DRAFT', to: 'PUBLISHED' }],
          },
        }),
      );
      expect(html).toContain('&lt;Channel&gt;');
      expect(html).toContain('Черновик');
      expect(html).toContain('Опубликовано');
      expect(html).not.toContain('DRAFT');
    },
  );

  it('renders the date of a cancelled calendar occurrence', () => {
    const html = renderer.render(
      log({
        entityType: 'CALENDAR',
        eventType: AuditEvent.CALENDAR_BLOCK_DELETED,
        payload: {
          title: 'Closed',
          occurrenceDate: '2026-11-11',
          changes: [{ field: 'repeatType', from: 'WEEKLY', to: '—' }],
        },
      }),
    );
    expect(html).toContain('2026-11-11');
    expect(html).toContain('Еженедельно');
  });

  it('renders removed shifts without changing legacy range-only entries', () => {
    const html = renderer.render(
      log({
        entityType: 'STAFF',
        eventType: AuditEvent.STAFF_SHIFTS_UPDATED,
        payload: {
          startDate: '2026-11-04',
          endDate: '2026-11-04',
          before: [
            { date: '2026-11-04', startTime: '09:00', endTime: '18:00' },
          ],
          after: [],
        },
      }),
    );
    expect(html).toContain('09:00');
    expect(html).toContain('18:00');
    expect(html).toContain('Смены отсутствуют');
  });

  it('renders access changes and supplier details with field labels', () => {
    const access = renderer.render(
      log({
        entityType: 'ACCESS',
        eventType: AuditEvent.ACCESS_CHANGED,
        payload: {
          title: 'OWNER_REPLACED',
          changes: [{ field: 'previousUserId', from: '—', to: 'old-owner' }],
        },
      }),
    );
    expect(access).toContain('Владелец заменён');
    expect(access).toContain('Предыдущий владелец');
    const supplier = renderer.render(
      log({
        entityType: 'SUPPLIER',
        eventType: AuditEvent.SUPPLIER_UPDATED,
        payload: {
          title: 'Acme',
          changes: [{ field: 'taxId', from: 'old-tax', to: 'new-tax' }],
        },
      }),
    );
    expect(supplier).toContain('ИНН / УНП');
    expect(supplier).toContain('old-tax');
    expect(supplier).toContain('new-tax');
  });
});
