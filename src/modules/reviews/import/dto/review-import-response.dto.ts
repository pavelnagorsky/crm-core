import { ApiProperty } from '@nestjs/swagger';
import {
  REVIEW_IMPORT_MAX_LISTED_ERRORS,
  REVIEW_IMPORT_MAX_LISTED_STAFF_NAMES,
} from '../constants/review-import.constants.js';
import { ReviewImportRowError } from '../enums/review-import-row-error.enum.js';
import { ReviewImportResult } from '../interfaces/review-import-result.interface.js';
import { ReviewImportRowErrorDto } from './review-import-row-error.dto.js';

export class ReviewImportResponseDto {
  @ApiProperty({ description: 'Non-empty rows below the header' })
  totalRows: number;

  @ApiProperty()
  importedCount: number;

  @ApiProperty({
    description: 'Valid rows already imported earlier or repeated in the file',
  })
  duplicateCount: number;

  @ApiProperty()
  errorCount: number;

  @ApiProperty({
    description:
      'Staff names that matched no active staff member or more than one; such names are skipped',
  })
  unmatchedStaffCount: number;

  @ApiProperty({
    type: [String],
    description: `Distinct unmatched staff names as written in the file, up to ${REVIEW_IMPORT_MAX_LISTED_STAFF_NAMES}`,
  })
  unmatchedStaffNames: string[];

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'number' },
    description: `Rejected rows per code: ${Object.values(ReviewImportRowError).join(', ')}`,
  })
  errorsByCode: Partial<Record<ReviewImportRowError, number>>;

  @ApiProperty({
    type: () => ReviewImportRowErrorDto,
    isArray: true,
    description: `The first ${REVIEW_IMPORT_MAX_LISTED_ERRORS} rejected rows`,
  })
  errors: ReviewImportRowErrorDto[];

  static fromEntity(result: ReviewImportResult): ReviewImportResponseDto {
    return Object.assign(new ReviewImportResponseDto(), {
      totalRows: result.totalRows,
      importedCount: result.importedCount,
      duplicateCount: result.duplicateCount,
      errorCount: result.errorCount,
      unmatchedStaffCount: result.unmatchedStaffCount,
      unmatchedStaffNames: result.unmatchedStaffNames,
      errorsByCode: result.errorsByCode,
      errors: result.errors.map(ReviewImportRowErrorDto.fromEntity),
    });
  }
}
