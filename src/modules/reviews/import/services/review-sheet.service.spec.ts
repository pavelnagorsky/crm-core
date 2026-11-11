import ExcelJS from 'exceljs';
import { PassThrough } from 'stream';
import { LocaleService } from '../../../../shared/i18n/locale.service.js';
import { XlsxUtils } from '../../../../shared/xlsx/xlsx.utils.js';
import {
  REVIEW_IMPORT_MAX_BYTES,
  REVIEW_IMPORT_MAX_ROWS,
} from '../constants/review-import.constants.js';
import { ReviewImportFileReason } from '../enums/review-import-file-reason.enum.js';
import { ReviewImportRowError } from '../enums/review-import-row-error.enum.js';
import { ReviewSheetColumn } from '../enums/review-sheet-column.enum.js';
import { ReviewImportUpload } from '../interfaces/review-import-upload.interface.js';
import { ReviewSheetRow } from '../interfaces/review-sheet-row.interface.js';
import { ReviewSheetScan } from '../interfaces/review-sheet-scan.interface.js';
import { ReviewImportTemplateService } from './review-import-template.service.js';
import { ReviewSheetService } from './review-sheet.service.js';

const HEADERS = [
  'Оценка',
  'Дата',
  'Текст',
  'Автор',
  'Сотрудник',
  'Источник',
  'Ответ',
  'ID',
];
const TIMEZONE = 'Europe/Minsk';
const NOW = new Date('2026-11-11T09:00:00Z');

const service = new ReviewSheetService();

async function workbook(
  rows: unknown[][],
  headers: unknown[] = HEADERS,
): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Отзывы');
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(row);
  return Buffer.from(await book.xlsx.writeBuffer());
}

function upload(
  buffer: Buffer,
  overrides: Partial<ReviewImportUpload> = {},
): ReviewImportUpload {
  return {
    size: buffer.length,
    originalname: 'reviews.xlsx',
    mimetype: XlsxUtils.mimeType,
    buffer,
    ...overrides,
  };
}

async function readAll(
  buffer: Buffer,
): Promise<{ scan: ReviewSheetScan; rows: ReviewSheetRow[] }> {
  const scan = await service.scan(upload(buffer));
  const rows: ReviewSheetRow[] = [];
  if (scan.ok)
    for await (const row of service.rows(scan, TIMEZONE, NOW)) rows.push(row);
  return { scan, rows };
}

function collect(stream: PassThrough): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

describe('ReviewSheetService', () => {
  // Server zone differs from UTC and from the location zone.
  const originalTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = 'America/New_York';
  });
  afterAll(() => {
    process.env.TZ = originalTz;
  });

  it('rejects a missing, oversized, or non-xlsx file before reading it', async () => {
    await expect(service.scan(undefined)).resolves.toEqual({
      ok: false,
      reason: ReviewImportFileReason.MISSING,
    });
    await expect(
      service.scan(upload(Buffer.alloc(0), { size: 0 })),
    ).resolves.toEqual({ ok: false, reason: ReviewImportFileReason.MISSING });
    await expect(
      service.scan(
        upload(Buffer.from('x'), { size: REVIEW_IMPORT_MAX_BYTES + 1 }),
      ),
    ).resolves.toEqual({
      ok: false,
      reason: ReviewImportFileReason.TOO_LARGE,
    });
    await expect(
      service.scan(
        upload(Buffer.from('a;b'), {
          originalname: 'reviews.csv',
          mimetype: 'text/csv',
        }),
      ),
    ).resolves.toEqual({
      ok: false,
      reason: ReviewImportFileReason.UNSUPPORTED_TYPE,
    });
  });

  it('reports a corrupt workbook', async () => {
    await expect(
      service.scan(upload(Buffer.from('not-a-workbook'))),
    ).resolves.toEqual({ ok: false, reason: ReviewImportFileReason.CORRUPT });
  });

  it('lists missing required columns before reading the rows', async () => {
    const buffer = await workbook([['Анна', 'текст']], ['Автор', 'Отзыв']);
    await expect(service.scan(upload(buffer))).resolves.toEqual({
      ok: false,
      reason: ReviewImportFileReason.MISSING_COLUMNS,
      missingColumns: [ReviewSheetColumn.RATING, ReviewSheetColumn.DATE],
    });
  });

  it('rejects a sheet without review rows', async () => {
    await expect(
      service.scan(upload(await workbook([[], ['', '', '']]))),
    ).resolves.toEqual({ ok: false, reason: ReviewImportFileReason.EMPTY });
  });

  it('parses a full row and keeps sheet row numbers across empty rows', async () => {
    const { scan, rows } = await readAll(
      await workbook([
        [],
        [
          5,
          '05.03.2025 14:30',
          '<b>Всё</b> понравилось',
          'Анна Мария Козлова',
          'Мария Иванова, Ольга; Мария Иванова',
          'Какой-то сайт',
          'Спасибо!',
          'yc-42',
        ],
      ]),
    );

    expect(scan).toMatchObject({ ok: true, headerRow: 1, totalRows: 1 });
    expect(rows).toEqual([
      {
        number: 3,
        ok: true,
        record: {
          importKey: 'id:yc-42',
          rating: 5,
          text: 'Всё понравилось',
          authorFirstName: 'Анна',
          authorLastName: 'Мария Козлова',
          reviewedAt: new Date('2025-03-05T11:30:00.000Z'),
          source: 'Какой-то сайт',
          replyText: 'Спасибо!',
          staffNames: ['Мария Иванова', 'Ольга'],
        },
      },
    ]);
  });

  it('reads Excel date cells as wall-clock time of the location', async () => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('Отзывы');
    sheet.addRow(['Оценка', 'Дата', 'Текст']);
    sheet.addRow([4, new Date(Date.UTC(2025, 2, 5, 14, 30)), 'Хорошо']);
    sheet.getCell('B2').numFmt = 'dd.mm.yyyy hh:mm';
    sheet.addRow([4, new Date(Date.UTC(2025, 6, 1)), 'Хорошо']);
    sheet.getCell('B3').numFmt = 'dd.mm.yyyy';

    const { rows } = await readAll(Buffer.from(await book.xlsx.writeBuffer()));

    expect(rows.map((row) => row.ok && row.record.reviewedAt)).toEqual([
      new Date('2025-03-05T11:30:00.000Z'),
      new Date('2025-07-01T09:00:00.000Z'),
    ]);
  });

  it('recognizes english and alternative headers, and a separate last name column', async () => {
    const { rows } = await readAll(
      await workbook(
        [['5 звёзд', '2025-03-05', 'Great', 'Anna', 'Smith', 'Мастер', 'x']],
        ['Rating', 'Date', 'Review', 'Имя', 'Фамилия', 'Staff', 'Source'],
      ),
    );
    expect(rows[0]).toMatchObject({
      ok: true,
      record: {
        rating: 5,
        text: 'Great',
        authorFirstName: 'Anna',
        authorLastName: 'Smith',
        staffNames: ['Мастер'],
        source: 'x',
      },
    });
  });

  it('splits a single first-name column at the first space and keeps an unknown author as null', async () => {
    const { rows } = await readAll(
      await workbook(
        [
          [5, '05.03.2025', 'Отлично', 'Анна Козлова'],
          [5, '06.03.2025', 'Отлично', ''],
        ],
        ['Оценка', 'Дата', 'Комментарий', 'Имя'],
      ),
    );
    expect(rows.map((row) => row.ok && row.record)).toMatchObject([
      { authorFirstName: 'Анна', authorLastName: 'Козлова' },
      {
        authorFirstName: null,
        authorLastName: null,
        source: null,
        replyText: null,
        staffNames: [],
      },
    ]);
  });

  it('rejects each invalid field with its own code', async () => {
    const valid = [5, '05.03.2025', 'Текст', 'Анна', '', '', '', ''];
    const withCell = (index: number, value: unknown) =>
      valid.map((cell, i) => (i === index ? value : cell));
    const { scan, rows } = await readAll(
      await workbook([
        withCell(0, 4.5),
        withCell(1, '31.02.2025'),
        withCell(2, '<p> </p>'),
        withCell(2, 'x'.repeat(2001)),
        withCell(3, `${'А'.repeat(101)} Козлова`),
        withCell(5, 's'.repeat(101)),
        withCell(6, 'r'.repeat(2001)),
        withCell(7, 'i'.repeat(129)),
        withCell(1, '12.11.2026'),
        valid,
      ]),
    );
    expect(scan).toMatchObject({ ok: true, totalRows: 10 });
    expect(rows.map((row) => (row.ok ? 'OK' : row.error))).toEqual([
      ReviewImportRowError.RATING_INVALID,
      ReviewImportRowError.DATE_INVALID,
      ReviewImportRowError.TEXT_REQUIRED,
      ReviewImportRowError.TEXT_TOO_LONG,
      ReviewImportRowError.AUTHOR_TOO_LONG,
      ReviewImportRowError.SOURCE_TOO_LONG,
      ReviewImportRowError.REPLY_TOO_LONG,
      ReviewImportRowError.ID_TOO_LONG,
      ReviewImportRowError.DATE_INVALID,
      'OK',
    ]);
    expect(rows.map((row) => row.number)).toEqual([
      2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
  });

  it('gives identical rows without an id the same key', async () => {
    const { rows } = await readAll(
      await workbook([
        [5, '05.03.2025', 'Отлично', 'Анна'],
        [5, '2025-03-05', 'отлично ', 'анна'],
        [5, '2025-03-05', 'Отлично', 'Мария'],
      ]),
    );
    const keys = rows.map((row) => row.ok && row.record.importKey);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it('accepts the downloadable template without errors', async () => {
    const locale = new LocaleService();
    locale.onModuleInit();
    const file = new ReviewImportTemplateService(locale).build();
    const { scan, rows } = await readAll(await collect(file.stream));

    expect(scan).toMatchObject({ ok: true, totalRows: 1 });
    if (!scan.ok) return;
    expect(Object.keys(scan.columns).sort()).toEqual(
      [
        ReviewSheetColumn.RATING,
        ReviewSheetColumn.DATE,
        ReviewSheetColumn.TEXT,
        ReviewSheetColumn.AUTHOR,
        ReviewSheetColumn.STAFF,
        ReviewSheetColumn.SOURCE,
        ReviewSheetColumn.REPLY,
        ReviewSheetColumn.ID,
      ].sort(),
    );
    expect(rows).toEqual([expect.objectContaining({ ok: true, number: 2 })]);
  });

  it(
    'streams the row limit and rejects one row more',
    { timeout: 120_000 },
    async () => {
      const row = [5, '05.03.2025 14:30', 'Отличный сервис', 'Анна Козлова'];
      const limit = await workbook(
        Array.from({ length: REVIEW_IMPORT_MAX_ROWS }, () => row),
      );

      const { scan, rows } = await readAll(limit);

      expect(scan).toMatchObject({
        ok: true,
        totalRows: REVIEW_IMPORT_MAX_ROWS,
      });
      expect(rows).toHaveLength(REVIEW_IMPORT_MAX_ROWS);
      expect(rows.every((parsed) => parsed.ok)).toBe(true);

      const over = await workbook(
        Array.from({ length: REVIEW_IMPORT_MAX_ROWS + 1 }, () => row),
      );
      await expect(service.scan(upload(over))).resolves.toEqual({
        ok: false,
        reason: ReviewImportFileReason.TOO_MANY_ROWS,
      });
    },
  );
});
