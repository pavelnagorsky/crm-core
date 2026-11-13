import { ReviewStatus } from '@prisma/client';
import { PassThrough } from 'stream';
import { OrderDirection } from '../../../../shared/enums/order-direction.enum.js';
import { LocaleService } from '../../../../shared/i18n/locale.service.js';
import { XlsxUtils } from '../../../../shared/xlsx/xlsx.utils.js';
import { LocationService } from '../../../location/services/location.service.js';
import { ReviewSearchOrderBy } from '../../enums/review-search-order-by.enum.js';
import { ReviewWithVisit } from '../../interfaces/review-with-visit.interface.js';
import { ReviewModerationService } from '../../services/review-moderation.service.js';
import { ReviewsExportService } from './reviews-export.service.js';

const labels = {
  sheet: 'Отзывы',
  reviewedAt: 'Дата отзыва',
  rating: 'Оценка',
  text: 'Текст отзыва',
  authorFirstName: 'Имя автора',
  authorLastName: 'Фамилия автора',
  staffNames: 'Сотрудники',
  visitStartAt: 'Визит',
  visitServices: 'Услуги визита',
  status: 'Статус',
  hiddenReason: 'Причина скрытия',
  replyText: 'Ответ',
  repliedAt: 'Дата ответа',
  repliedByName: 'Автор ответа',
  source: 'Источник',
};

const reviewStatus = { PUBLISHED: 'Опубликован', HIDDEN: 'Скрыт' };

function collect(stream: PassThrough): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

function review(overrides: Partial<ReviewWithVisit> = {}): ReviewWithVisit {
  return {
    id: 'review-1',
    locationId: 'location-1',
    bookingId: 'booking-1',
    clientId: 'client-1',
    rating: 5,
    text: 'Всё отлично',
    authorFirstName: 'Анна',
    authorLastName: 'Иванова',
    reviewedAt: new Date('2026-11-11T21:30:00Z'),
    status: ReviewStatus.PUBLISHED,
    hiddenAt: null,
    hiddenReason: null,
    replyText: 'Спасибо!',
    repliedAt: new Date('2026-11-12T07:00:00Z'),
    repliedByName: 'Мария Петрова',
    source: null,
    importKey: null,
    importBatchId: null,
    createdAt: new Date('2026-11-11T21:30:00Z'),
    updatedAt: new Date('2026-11-11T21:30:00Z'),
    staff: [
      { reviewId: 'review-1', staffId: 'staff-2', staffName: 'Ольга' },
      { reviewId: 'review-1', staffId: 'staff-1', staffName: 'Елена' },
    ],
    visit: {
      startAt: new Date('2026-11-11T15:00:00Z'),
      services: [
        { id: 'service-1', name: 'Стрижка' },
        { id: 'service-2', name: 'Укладка' },
      ],
    },
    ...overrides,
  } as ReviewWithVisit;
}

describe('ReviewsExportService', () => {
  const reviews = { search: vi.fn<ReviewModerationService['search']>() };
  const locations = { getLocale: vi.fn<LocationService['getLocale']>() };
  const locale = { get: vi.fn<LocaleService['get']>() };
  const service = new ReviewsExportService(
    reviews as unknown as ReviewModerationService,
    locations as unknown as LocationService,
    locale as unknown as LocaleService,
  );

  beforeEach(() => {
    reviews.search.mockReset();
    locations.getLocale.mockReset();
    locations.getLocale.mockResolvedValue({
      timezone: 'Europe/Minsk',
      currency: 'BYN',
    });
    locale.get.mockReset();
    locale.get.mockReturnValue({
      documents: { reviews: labels },
      reviewStatus,
    } as unknown as ReturnType<LocaleService['get']>);
  });

  it('exports every review matching the table filters and order as xlsx', async () => {
    reviews.search.mockResolvedValue({
      items: [
        review(),
        review({
          id: 'review-2',
          rating: 2,
          text: 'Долго ждали',
          authorLastName: null,
          status: ReviewStatus.HIDDEN,
          hiddenReason: 'спам',
          replyText: null,
          repliedAt: null,
          repliedByName: null,
          source: 'YCLIENTS',
          staff: [],
          visit: null,
        }),
      ],
      totalItems: 2,
    });

    const file = await service.stream('location-1', {
      search: 'анна',
      staffId: 'staff-1',
      clientId: 'client-1',
      replied: true,
      status: ReviewStatus.PUBLISHED,
      rating: 5,
      from: '2026-11-01T00:00:00.000Z',
      to: '2026-11-30T23:59:59.000Z',
      orderBy: ReviewSearchOrderBy.RATING,
      orderDirection: OrderDirection.ASC,
    });

    expect(reviews.search).toHaveBeenCalledWith('location-1', {
      search: 'анна',
      staffId: 'staff-1',
      clientId: 'client-1',
      replied: true,
      status: ReviewStatus.PUBLISHED,
      rating: 5,
      from: '2026-11-01T00:00:00.000Z',
      to: '2026-11-30T23:59:59.000Z',
      orderBy: ReviewSearchOrderBy.RATING,
      orderDirection: OrderDirection.ASC,
      page: 1,
      pageSize: 1,
      isExport: true,
    });
    expect(locations.getLocale).toHaveBeenCalledWith('location-1');
    expect(file.filename).toMatch(/^reviews-\d{4}-\d{2}-\d{2}\.xlsx$/);

    const grid = await XlsxUtils.read(await collect(file.stream));
    expect(grid).not.toBeNull();
    if (!grid) return;
    expect(grid.rowCount).toBe(3);
    expect(grid.row(1).text(1)).toBe('Дата отзыва');
    expect(grid.row(1).text(14)).toBe('Источник');
    expect(grid.row(2).text(1)).toBe('12.11.2026 00:30');
    expect(grid.row(2).text(2)).toBe('5');
    expect(grid.row(2).text(3)).toBe('Всё отлично');
    expect(grid.row(2).text(4)).toBe('Анна');
    expect(grid.row(2).text(6)).toBe('Елена, Ольга');
    expect(grid.row(2).text(7)).toBe('11.11.2026 18:00');
    expect(grid.row(2).text(8)).toBe('Стрижка, Укладка');
    expect(grid.row(2).text(9)).toBe('Опубликован');
    expect(grid.row(2).text(11)).toBe('Спасибо!');
    expect(grid.row(2).text(12)).toBe('12.11.2026 10:00');
    expect(grid.row(2).text(13)).toBe('Мария Петрова');
    expect(grid.row(3).text(2)).toBe('2');
    expect(grid.row(3).text(5)).toBe('');
    expect(grid.row(3).text(6)).toBe('');
    expect(grid.row(3).text(7)).toBe('');
    expect(grid.row(3).text(9)).toBe('Скрыт');
    expect(grid.row(3).text(10)).toBe('спам');
    expect(grid.row(3).text(11)).toBe('');
    expect(grid.row(3).text(14)).toBe('YCLIENTS');
  });
});
