import { ExecutionContext, INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { LocaleService } from '../../../../shared/i18n/locale.service.js';
import { GlobalExceptionFilter } from '../../../../shared/filters/exception.filter.js';
import { XlsxUtils } from '../../../../shared/xlsx/xlsx.utils.js';
import { Claim } from '../../../access/enums/claim.enum.js';
import { Write } from '../../../access/utils/permission.js';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard.js';
import {
  PermissionGuard,
  PERMISSIONS_KEY,
} from '../../../auth/guards/permission.guard.js';
import { TokenEpochGuard } from '../../../auth/guards/token-epoch.guard.js';
import { LocationService } from '../../../location/services/location.service.js';
import { StaffService } from '../../../staff/services/staff.service.js';
import { ReviewsFacade } from '../../reviews.facade.js';
import { REVIEW_IMPORT_MAX_BYTES } from '../constants/review-import.constants.js';
import { ReviewImportFileInterceptor } from '../interceptors/review-import-file.interceptor.js';
import { ReviewImportTemplateService } from '../services/review-import-template.service.js';
import { ReviewImportService } from '../services/review-import.service.js';
import { ReviewSheetService } from '../services/review-sheet.service.js';
import { ReviewImportController } from './review-import.controller.js';

async function workbook(rows: unknown[][]): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Отзывы');
  sheet.addRow(['Оценка', 'Дата', 'Текст', 'Сотрудник']);
  for (const row of rows) sheet.addRow(row);
  return Buffer.from(await book.xlsx.writeBuffer());
}

describe('Review import API (HTTP)', () => {
  let app: INestApplication;
  const locationId = '22222222-2222-4222-8222-222222222222';
  const base = `/locations/${locationId}/reviews/import`;
  const reviews = {
    insertImportedBatch: vi.fn(),
    completeImport: vi.fn(),
  };
  const staff = { matchActiveByNames: vi.fn() };
  const locations = { getLocale: vi.fn() };

  beforeAll(async () => {
    const locale = new LocaleService();
    locale.onModuleInit();
    const module = await Test.createTestingModule({
      controllers: [ReviewImportController],
      providers: [
        ReviewImportService,
        ReviewSheetService,
        ReviewImportTemplateService,
        ReviewImportFileInterceptor,
        { provide: LocaleService, useValue: locale },
        { provide: ReviewsFacade, useValue: reviews },
        { provide: StaffService, useValue: staff },
        { provide: LocationService, useValue: locations },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().user = {
            sub: 'user-1',
            role: UserRole.USER,
            firstName: 'Мария',
            lastName: 'Иванова',
            brandMemberships: [],
            locationMemberships: [],
          };
          return true;
        },
      })
      .overrideGuard(TokenEpochGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });
  afterAll(async () => app?.close());
  beforeEach(() => {
    vi.clearAllMocks();
    locations.getLocale.mockResolvedValue({
      timezone: 'Europe/Minsk',
      currency: 'BYN',
    });
    staff.matchActiveByNames.mockImplementation(
      async (_location: string, names: string[]) =>
        new Map(
          names.map((name) => [
            name,
            name === 'Мария' ? [{ id: 's1', name: 'Мария' }] : [],
          ]),
        ),
    );
    reviews.insertImportedBatch.mockImplementation(
      async (_location: string, _batch: string, items: unknown[]) =>
        items.length,
    );
  });

  it('imports valid rows and reports invalid ones by row number', async () => {
    const file = await workbook([
      [5, '05.03.2025', 'Отлично', 'Мария, Ольга'],
      [9, '05.03.2025', 'Слишком щедро', ''],
      [4, '06.03.2025', '', ''],
    ]);

    const { body } = await request(app.getHttpServer())
      .post(base)
      .attach('file', file, 'reviews.xlsx')
      .expect(201);

    expect(body.responseValue).toEqual({
      totalRows: 3,
      importedCount: 1,
      duplicateCount: 0,
      errorCount: 2,
      unmatchedStaffCount: 1,
      unmatchedStaffNames: ['Ольга'],
      errorsByCode: { RATING_INVALID: 1, TEXT_REQUIRED: 1 },
      errors: [
        { row: 3, code: 'RATING_INVALID' },
        { row: 4, code: 'TEXT_REQUIRED' },
      ],
    });
    expect(reviews.insertImportedBatch.mock.calls[0][0]).toBe(locationId);
    expect(reviews.insertImportedBatch.mock.calls[0][2][0]).toMatchObject({
      rating: 5,
      text: 'Отлично',
      reviewedAt: new Date('2025-03-05T09:00:00.000Z'),
      staff: [{ staffId: 's1', staffName: 'Мария' }],
    });
    expect(reviews.completeImport.mock.calls[0][2]).toMatchObject({
      id: 'user-1',
      name: 'Мария Иванова',
    });
  });

  it('rejects a request without a file', async () => {
    const { body } = await request(app.getHttpServer()).post(base).expect(400);
    expect(body.responseCode).toBe('REVIEW_IMPORT_FILE_MISSING');
    expect(reviews.insertImportedBatch).not.toHaveBeenCalled();
  });

  it('rejects a file over the size limit with 413', async () => {
    const { body } = await request(app.getHttpServer())
      .post(base)
      .attach('file', Buffer.alloc(REVIEW_IMPORT_MAX_BYTES + 1), 'big.xlsx')
      .expect(413);
    expect(body.responseCode).toBe('REVIEW_IMPORT_FILE_TOO_LARGE');
  });

  it('lists missing required columns', async () => {
    const book = new ExcelJS.Workbook();
    book.addWorksheet('Отзывы').addRow(['Текст']);
    book.getWorksheet('Отзывы')?.addRow(['Отлично']);
    const { body } = await request(app.getHttpServer())
      .post(base)
      .attach('file', Buffer.from(await book.xlsx.writeBuffer()), 'r.xlsx')
      .expect(400);
    expect(body.responseCode).toBe('REVIEW_IMPORT_MISSING_COLUMNS');
    expect(body.responseValue).toEqual(['rating', 'date']);
  });

  it('downloads the template as an xlsx attachment', async () => {
    const response = await request(app.getHttpServer())
      .get(`${base}/template`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);

    expect(response.headers['content-type']).toContain(XlsxUtils.mimeType);
    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="reviews-import-template.xlsx"',
    );
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(response.body as ArrayBuffer);
    expect(book.worksheets.map((sheet) => sheet.name)).toEqual([
      'Отзывы',
      'Подсказки',
    ]);
  });
});

describe('Review import API permissions', () => {
  const reflector = new Reflector();
  const proto = ReviewImportController.prototype;

  it.each(['getTemplate', 'import'] as const)(
    '%s needs review.import:write',
    (handler) => {
      expect(reflector.get(PERMISSIONS_KEY, proto[handler])).toEqual([
        Write(Claim.REVIEW_IMPORT),
      ]);
    },
  );
});
