import { BookingSource, BookingStatus, Prisma } from '@prisma/client';
import { PassThrough } from 'stream';
import { booking as bookingFixture } from '../../testing/factories/booking.factory.js';
import { BookingFixtureOptions } from '../../testing/interfaces/booking-fixture-options.interface.js';
import { OrderDirection } from '../../../../shared/enums/order-direction.enum.js';
import { LocaleService } from '../../../../shared/i18n/locale.service.js';
import { XlsxUtils } from '../../../../shared/xlsx/xlsx.utils.js';
import { BookingsFacade } from '../../bookings.facade.js';
import { BookingSearchOrderBy } from '../../enums/booking-search-order-by.enum.js';
import { BookingStatus as BookingStatusFilter } from '../../enums/booking-status.enum.js';
import { BookingWithItems } from '../../interfaces/booking-with-items.interface.js';
import { BookingsExportService } from './bookings-export.service.js';

const labels = {
  sheet: 'Записи',
  startAt: 'Начало',
  endAt: 'Конец',
  status: 'Статус',
  source: 'Источник',
  clientFirstName: 'Имя клиента',
  clientLastName: 'Фамилия клиента',
  clientPhone: 'Телефон клиента',
  clientEmail: 'Email клиента',
  serviceTitle: 'Услуга',
  serviceDuration: 'Длительность (мин)',
  price: 'Цена',
  staffName: 'Сотрудник',
  notes: 'Заметки клиента',
  internalNotes: 'Внутренние заметки',
  cancellationReason: 'Причина отмены',
  createdAt: 'Создана',
};

const bookingStatus = {
  CONFIRMED: 'Подтверждено',
  CANCELLED: 'Отменено',
};

const bookingSource = {
  MANUAL: 'Вручную',
  WIDGET: 'Виджет',
};

function collect(stream: PassThrough): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

function booking(overrides: BookingFixtureOptions = {}): BookingWithItems {
  return bookingFixture({
    locationId: 'business-1',
    clientId: 'client-1',
    clientFirstName: 'Анна',
    clientLastName: 'Иванова',
    clientPhone: '+375291112233',
    clientEmail: 'anna@example.com',
    notes: 'у окна',
    internalNotes: 'постоянный клиент',
    createdAt: new Date('2026-09-20T08:00:00Z'),
    updatedAt: new Date('2026-09-20T08:00:00Z'),
    ...overrides,
    item: {
      serviceId: 'service-1',
      staffId: 'staff-1',
      serviceTitle: 'Стрижка',
      staffName: 'Мария',
      ...overrides.item,
    },
  });
}

describe('BookingsExportService', () => {
  const bookings = {
    search: vi.fn<BookingsFacade['search']>(),
  };
  const locale = {
    get: vi.fn<LocaleService['get']>(),
  };
  const service = new BookingsExportService(
    bookings as unknown as BookingsFacade,
    locale as unknown as LocaleService,
  );

  beforeEach(() => {
    bookings.search.mockReset();
    locale.get.mockReset();
    locale.get.mockReturnValue({
      documents: { bookings: labels },
      bookingStatus,
      bookingSource,
    } as unknown as ReturnType<LocaleService['get']>);
  });

  it('exports every booking matching the table filters and order as xlsx', async () => {
    bookings.search.mockResolvedValue({
      items: [
        booking(),
        booking({
          id: 'booking-2',
          status: BookingStatus.CANCELLED,
          source: BookingSource.WIDGET,
          clientEmail: null,
          notes: null,
          internalNotes: null,
          cancellationReason: 'не смогу',
          item: { customPrice: new Prisma.Decimal('40.00') },
        }),
      ],
      totalItems: 2,
    });

    const file = await service.stream('business-1', {
      search: 'анна',
      status: BookingStatusFilter.CONFIRMED,
      staffIds: ['staff-1'],
      clientId: 'client-1',
      catalogItemIds: ['service-1'],
      startFrom: '2026-09-01T00:00:00.000Z',
      startTo: '2026-09-30T23:59:59.000Z',
      createdFrom: '2026-09-01T00:00:00.000Z',
      createdTo: '2026-09-30T23:59:59.000Z',
      orderBy: BookingSearchOrderBy.START_AT,
      orderDirection: OrderDirection.ASC,
    });

    expect(bookings.search).toHaveBeenCalledWith('business-1', {
      search: 'анна',
      status: BookingStatusFilter.CONFIRMED,
      staffIds: ['staff-1'],
      clientId: 'client-1',
      catalogItemIds: ['service-1'],
      startFrom: '2026-09-01T00:00:00.000Z',
      startTo: '2026-09-30T23:59:59.000Z',
      createdFrom: '2026-09-01T00:00:00.000Z',
      createdTo: '2026-09-30T23:59:59.000Z',
      orderBy: BookingSearchOrderBy.START_AT,
      orderDirection: OrderDirection.ASC,
      page: 1,
      pageSize: 1,
      isExport: true,
    });
    expect(file.filename).toMatch(/^bookings-\d{4}-\d{2}-\d{2}\.xlsx$/);

    const grid = await XlsxUtils.read(await collect(file.stream));
    expect(grid).not.toBeNull();
    if (!grid) return;
    expect(grid.rowCount).toBe(3);
    expect(grid.row(1).text(1)).toBe('Начало');
    expect(grid.row(1).text(11)).toBe('Цена');
    expect(grid.row(1).text(16)).toBe('Создана');
    expect(grid.row(2).text(1)).toBe('2026-09-24T10:00:00.000Z');
    expect(grid.row(2).text(3)).toBe('Подтверждено');
    expect(grid.row(2).text(4)).toBe('Вручную');
    expect(grid.row(2).text(5)).toBe('Анна');
    expect(grid.row(2).text(7)).toBe('+375291112233');
    expect(grid.row(2).text(10)).toBe('60');
    expect(grid.row(2).text(11)).toBe('50.00');
    expect(grid.row(2).text(13)).toBe('у окна');
    expect(grid.row(2).text(15)).toBe('');
    expect(grid.row(3).text(3)).toBe('Отменено');
    expect(grid.row(3).text(4)).toBe('Виджет');
    expect(grid.row(3).text(8)).toBe('');
    expect(grid.row(3).text(11)).toBe('40.00');
    expect(grid.row(3).text(13)).toBe('');
    expect(grid.row(3).text(15)).toBe('не смогу');
  });
});
