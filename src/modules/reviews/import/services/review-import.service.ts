import { HttpStatus, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AppException } from '../../../../shared/exceptions/app.exception.js';
import { ErrorCodeEntry } from '../../../../shared/interfaces/error-code-entry.interface.js';
import { ErrorCode } from '../../../../shared/validation/error-codes.enum.js';
import { AuditActor } from '../../../audit/interfaces/audit-actor.interface.js';
import { LocationService } from '../../../location/services/location.service.js';
import { StaffService } from '../../../staff/services/staff.service.js';
import { ImportedReview } from '../../interfaces/imported-review.interface.js';
import { ReviewsFacade } from '../../reviews.facade.js';
import {
  REVIEW_IMPORT_BATCH_SIZE,
  REVIEW_IMPORT_MAX_LISTED_ERRORS,
  REVIEW_IMPORT_MAX_LISTED_STAFF_NAMES,
} from '../constants/review-import.constants.js';
import { ReviewImportFileReason } from '../enums/review-import-file-reason.enum.js';
import { ReviewImportResult } from '../interfaces/review-import-result.interface.js';
import { ReviewImportUpload } from '../interfaces/review-import-upload.interface.js';
import { ReviewSheetRecord } from '../interfaces/review-sheet-record.interface.js';
import { ReviewSheetScan } from '../interfaces/review-sheet-scan.interface.js';
import { ReviewSheetService } from './review-sheet.service.js';

const FILE_ERRORS: Record<
  ReviewImportFileReason,
  { entry: ErrorCodeEntry; status: HttpStatus }
> = {
  [ReviewImportFileReason.MISSING]: {
    entry: ErrorCode.REVIEW_IMPORT_FILE_MISSING,
    status: HttpStatus.BAD_REQUEST,
  },
  [ReviewImportFileReason.TOO_LARGE]: {
    entry: ErrorCode.REVIEW_IMPORT_FILE_TOO_LARGE,
    status: HttpStatus.PAYLOAD_TOO_LARGE,
  },
  [ReviewImportFileReason.UNSUPPORTED_TYPE]: {
    entry: ErrorCode.REVIEW_IMPORT_FILE_UNSUPPORTED,
    status: HttpStatus.UNPROCESSABLE_ENTITY,
  },
  [ReviewImportFileReason.CORRUPT]: {
    entry: ErrorCode.REVIEW_IMPORT_FILE_CORRUPT,
    status: HttpStatus.BAD_REQUEST,
  },
  [ReviewImportFileReason.MISSING_COLUMNS]: {
    entry: ErrorCode.REVIEW_IMPORT_MISSING_COLUMNS,
    status: HttpStatus.BAD_REQUEST,
  },
  [ReviewImportFileReason.EMPTY]: {
    entry: ErrorCode.REVIEW_IMPORT_FILE_EMPTY,
    status: HttpStatus.BAD_REQUEST,
  },
  [ReviewImportFileReason.TOO_MANY_ROWS]: {
    entry: ErrorCode.REVIEW_IMPORT_TOO_MANY_ROWS,
    status: HttpStatus.BAD_REQUEST,
  },
};

/**
 * One-step import from another CRM: valid rows are written at once in batches, invalid rows
 * are skipped and reported. Re-uploading a fixed file is safe, accepted rows become duplicates.
 */
@Injectable()
export class ReviewImportService {
  constructor(
    private readonly sheet: ReviewSheetService,
    private readonly reviews: ReviewsFacade,
    private readonly staff: StaffService,
    private readonly locations: LocationService,
  ) {}

  async import(
    locationId: string,
    file: ReviewImportUpload | undefined,
    actor: AuditActor,
  ): Promise<ReviewImportResult> {
    const { timezone } = await this.locations.getLocale(locationId);
    const scan = await this.sheet.scan(file);
    if (!scan.ok) this.rejectFile(scan);

    const batchId = randomUUID();
    const result: ReviewImportResult = {
      totalRows: scan.totalRows,
      importedCount: 0,
      duplicateCount: 0,
      errorCount: 0,
      unmatchedStaffCount: 0,
      unmatchedStaffNames: [],
      errorsByCode: {},
      errors: [],
    };
    let validCount = 0;
    let batch: ReviewSheetRecord[] = [];
    const flush = async () => {
      const written = await this.writeBatch(locationId, batchId, batch);
      result.importedCount += written.inserted;
      result.unmatchedStaffCount += written.unmatched.length;
      for (const name of written.unmatched)
        if (
          result.unmatchedStaffNames.length <
            REVIEW_IMPORT_MAX_LISTED_STAFF_NAMES &&
          !result.unmatchedStaffNames.includes(name)
        )
          result.unmatchedStaffNames.push(name);
      batch = [];
    };

    try {
      for await (const row of this.sheet.rows(scan, timezone, new Date())) {
        if (!row.ok) {
          result.errorCount += 1;
          result.errorsByCode[row.error] =
            (result.errorsByCode[row.error] ?? 0) + 1;
          if (result.errors.length < REVIEW_IMPORT_MAX_LISTED_ERRORS)
            result.errors.push({ row: row.number, code: row.error });
          continue;
        }
        validCount += 1;
        batch.push(row.record);
        if (batch.length >= REVIEW_IMPORT_BATCH_SIZE) await flush();
      }
      if (batch.length > 0) await flush();
      result.duplicateCount = validCount - result.importedCount;
    } finally {
      // Batches committed before a failure stay: summaries and the audit must reflect them.
      await this.reviews.completeImport(
        locationId,
        {
          batchId,
          fileName: scan.file.originalname,
          totalRows: result.totalRows,
          importedCount: result.importedCount,
          duplicateCount: result.duplicateCount,
          errorCount: result.errorCount,
        },
        actor,
      );
    }
    return result;
  }

  /** A staff name links the review only when it matches exactly one active staff member. */
  private async writeBatch(
    locationId: string,
    batchId: string,
    records: readonly ReviewSheetRecord[],
  ): Promise<{ inserted: number; unmatched: string[] }> {
    const matches = await this.staff.matchActiveByNames(locationId, [
      ...new Set(records.flatMap((record) => record.staffNames)),
    ]);
    const unmatched: string[] = [];
    const reviews: ImportedReview[] = records.map(
      ({ staffNames, ...record }) => {
        const staff = new Map<string, string>();
        for (const name of staffNames) {
          const found = matches.get(name) ?? [];
          if (found.length === 1) staff.set(found[0].id, found[0].name);
          else unmatched.push(name);
        }
        return {
          ...record,
          staff: [...staff].map(([staffId, staffName]) => ({
            staffId,
            staffName,
          })),
        };
      },
    );
    const inserted = await this.reviews.insertImportedBatch(
      locationId,
      batchId,
      reviews,
    );
    return { inserted, unmatched };
  }

  private rejectFile(failure: Extract<ReviewSheetScan, { ok: false }>): never {
    const mapped = FILE_ERRORS[failure.reason];
    const payload =
      failure.reason === ReviewImportFileReason.MISSING_COLUMNS
        ? (failure.missingColumns ?? null)
        : null;
    throw new AppException(mapped.entry, mapped.status, payload);
  }
}
