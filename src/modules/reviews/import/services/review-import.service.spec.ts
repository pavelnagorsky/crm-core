import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../../shared/validation/error-codes.enum.js';
import { AuditActorRole } from '../../../audit/enums/audit-actor-role.enum.js';
import { AuditActor } from '../../../audit/interfaces/audit-actor.interface.js';
import { LocationService } from '../../../location/services/location.service.js';
import { StaffService } from '../../../staff/services/staff.service.js';
import { ImportedReview } from '../../interfaces/imported-review.interface.js';
import { ReviewsFacade } from '../../reviews.facade.js';
import {
  REVIEW_IMPORT_BATCH_SIZE,
  REVIEW_IMPORT_MAX_LISTED_ERRORS,
} from '../constants/review-import.constants.js';
import { ReviewImportFileReason } from '../enums/review-import-file-reason.enum.js';
import { ReviewImportRowError } from '../enums/review-import-row-error.enum.js';
import { ReviewSheetColumn } from '../enums/review-sheet-column.enum.js';
import { ReviewImportUpload } from '../interfaces/review-import-upload.interface.js';
import { ReviewSheetRecord } from '../interfaces/review-sheet-record.interface.js';
import { ReviewSheetRow } from '../interfaces/review-sheet-row.interface.js';
import { ReviewImportService } from './review-import.service.js';
import { ReviewSheetService } from './review-sheet.service.js';

const actor: AuditActor = {
  id: 'user-1',
  name: 'Ольга',
  role: AuditActorRole.OWNER,
};
const file: ReviewImportUpload = {
  size: 10,
  originalname: 'yclients.xlsx',
  mimetype: 'application/octet-stream',
  buffer: Buffer.from('xlsx'),
};

function record(
  importKey: string,
  staffNames: string[] = [],
): ReviewSheetRecord {
  return {
    importKey,
    rating: 5,
    text: 'Отлично',
    authorFirstName: 'Анна',
    authorLastName: null,
    reviewedAt: new Date('2025-03-05T09:00:00Z'),
    source: null,
    replyText: null,
    staffNames,
  };
}

const valid = (number: number, staffNames: string[] = []): ReviewSheetRow => ({
  number,
  ok: true,
  record: record(`key-${number}`, staffNames),
});
const invalid = (
  number: number,
  error = ReviewImportRowError.RATING_INVALID,
): ReviewSheetRow => ({ number, ok: false, error });

function setup(rows: ReviewSheetRow[]) {
  const sheet = {
    scan: vi.fn<ReviewSheetService['scan']>().mockResolvedValue({
      ok: true,
      file,
      headerRow: 1,
      columns: {},
      totalRows: rows.length,
    }),
    rows: vi.fn(async function* (..._args: unknown[]) {
      yield* rows;
    }),
  };
  const reviews = {
    insertImportedBatch: vi.fn(
      async (_location: string, _batch: string, items: ImportedReview[]) =>
        items.length,
    ),
    completeImport: vi.fn().mockResolvedValue(undefined),
  };
  const staff = {
    matchActiveByNames: vi.fn(async (_location: string, names: string[]) => {
      const directory: Record<string, { id: string; name: string }[]> = {
        Мария: [{ id: 's1', name: 'Мария Иванова' }],
        'Мария Иванова': [{ id: 's1', name: 'Мария Иванова' }],
        Ольга: [
          { id: 's2', name: 'Ольга' },
          { id: 's3', name: 'ольга' },
        ],
      };
      return new Map(names.map((name) => [name, directory[name] ?? []]));
    }),
  };
  const locations = {
    getLocale: vi
      .fn()
      .mockResolvedValue({ timezone: 'Europe/Minsk', currency: 'BYN' }),
  };
  const service = new ReviewImportService(
    sheet as unknown as ReviewSheetService,
    reviews as unknown as ReviewsFacade,
    staff as unknown as StaffService,
    locations as unknown as LocationService,
  );
  return { sheet, reviews, staff, locations, service };
}

describe('ReviewImportService', () => {
  it('rejects an unreadable file with the mapped code and writes nothing', async () => {
    const { sheet, reviews, service } = setup([]);
    sheet.scan.mockResolvedValue({
      ok: false,
      reason: ReviewImportFileReason.MISSING_COLUMNS,
      missingColumns: [ReviewSheetColumn.DATE],
    });

    const error = await service
      .import('loc', file, actor)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect((error as AppException).errorCode).toBe(
      ErrorCode.REVIEW_IMPORT_MISSING_COLUMNS.code,
    );
    expect((error as AppException).payload).toEqual([ReviewSheetColumn.DATE]);
    expect(reviews.insertImportedBatch).not.toHaveBeenCalled();
    expect(reviews.completeImport).not.toHaveBeenCalled();
  });

  it.each([
    [ReviewImportFileReason.TOO_LARGE, HttpStatus.PAYLOAD_TOO_LARGE],
    [ReviewImportFileReason.UNSUPPORTED_TYPE, HttpStatus.UNPROCESSABLE_ENTITY],
    [ReviewImportFileReason.TOO_MANY_ROWS, HttpStatus.BAD_REQUEST],
  ])('maps %s to HTTP %i', async (reason, status) => {
    const { sheet, service } = setup([]);
    sheet.scan.mockResolvedValue({ ok: false, reason });
    await expect(service.import('loc', file, actor)).rejects.toMatchObject({
      status,
    });
  });

  it('parses dates in the location zone and writes valid rows in batches of 500', async () => {
    const rows = Array.from(
      { length: REVIEW_IMPORT_BATCH_SIZE * 2 + 1 },
      (_, i) => valid(i + 2),
    );
    const { sheet, reviews, service } = setup(rows);

    const result = await service.import('loc', file, actor);

    expect(sheet.rows.mock.calls[0][1]).toBe('Europe/Minsk');
    expect(
      reviews.insertImportedBatch.mock.calls.map((call) => call[2].length),
    ).toEqual([REVIEW_IMPORT_BATCH_SIZE, REVIEW_IMPORT_BATCH_SIZE, 1]);
    const batchIds = new Set(
      reviews.insertImportedBatch.mock.calls.map((call) => call[1]),
    );
    expect(batchIds.size).toBe(1);
    expect(result).toMatchObject({
      totalRows: rows.length,
      importedCount: rows.length,
      duplicateCount: 0,
      errorCount: 0,
    });
  });

  it('counts rows skipped by the database as duplicates and records one audit entry', async () => {
    const { reviews, service } = setup([valid(2), valid(3), valid(4)]);
    reviews.insertImportedBatch.mockResolvedValueOnce(1);

    const result = await service.import('loc', file, actor);

    expect(result).toMatchObject({ importedCount: 1, duplicateCount: 2 });
    expect(reviews.completeImport).toHaveBeenCalledTimes(1);
    expect(reviews.completeImport).toHaveBeenCalledWith(
      'loc',
      {
        batchId: reviews.insertImportedBatch.mock.calls[0][1],
        fileName: 'yclients.xlsx',
        totalRows: 3,
        importedCount: 1,
        duplicateCount: 2,
        errorCount: 0,
      },
      actor,
    );
  });

  it('still records the batches written before a failure', async () => {
    const rows = Array.from({ length: REVIEW_IMPORT_BATCH_SIZE + 1 }, (_, i) =>
      valid(i + 2),
    );
    const { reviews, service } = setup(rows);
    reviews.insertImportedBatch
      .mockResolvedValueOnce(REVIEW_IMPORT_BATCH_SIZE)
      .mockRejectedValueOnce(new Error('connection lost'));

    await expect(service.import('loc', file, actor)).rejects.toThrow(
      'connection lost',
    );
    expect(reviews.completeImport).toHaveBeenCalledWith(
      'loc',
      expect.objectContaining({ importedCount: REVIEW_IMPORT_BATCH_SIZE }),
      actor,
    );
  });

  it('counts every error by code but lists only the first 100 rows', async () => {
    const rows = [
      valid(2),
      ...Array.from({ length: REVIEW_IMPORT_MAX_LISTED_ERRORS + 5 }, (_, i) =>
        invalid(
          i + 3,
          i % 2 === 0
            ? ReviewImportRowError.RATING_INVALID
            : ReviewImportRowError.DATE_INVALID,
        ),
      ),
    ];
    const { service } = setup(rows);

    const result = await service.import('loc', file, actor);

    expect(result.errorCount).toBe(REVIEW_IMPORT_MAX_LISTED_ERRORS + 5);
    expect(result.errorsByCode).toEqual({
      [ReviewImportRowError.RATING_INVALID]: 53,
      [ReviewImportRowError.DATE_INVALID]: 52,
    });
    expect(result.errors).toHaveLength(REVIEW_IMPORT_MAX_LISTED_ERRORS);
    expect(result.errors[0]).toEqual({
      row: 3,
      code: ReviewImportRowError.RATING_INVALID,
    });
    expect(result.importedCount).toBe(1);
  });

  it('links every uniquely matched master and skips unknown or ambiguous names', async () => {
    const { reviews, staff, service } = setup([
      valid(2, ['Мария Иванова', 'Мария', 'Ольга', 'Незнакомка']),
      valid(3, ['Мария', 'Незнакомка']),
      valid(4),
    ]);

    const result = await service.import('loc', file, actor);

    expect(staff.matchActiveByNames).toHaveBeenCalledWith('loc', [
      'Мария Иванова',
      'Мария',
      'Ольга',
      'Незнакомка',
    ]);
    const written = reviews.insertImportedBatch.mock.calls[0][2];
    expect(written.map((review) => review.staff)).toEqual([
      [{ staffId: 's1', staffName: 'Мария Иванова' }],
      [{ staffId: 's1', staffName: 'Мария Иванова' }],
      [],
    ]);
    expect(written[0]).not.toHaveProperty('staffNames');
    expect(result.unmatchedStaffCount).toBe(3);
    expect(result.unmatchedStaffNames).toEqual(['Ольга', 'Незнакомка']);
  });
});
