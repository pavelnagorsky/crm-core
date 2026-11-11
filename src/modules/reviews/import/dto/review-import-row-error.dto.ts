import { ApiProperty } from '@nestjs/swagger';
import { ReviewImportRowError } from '../enums/review-import-row-error.enum.js';
import { ReviewImportRowFailure } from '../interfaces/review-import-row-failure.interface.js';

export class ReviewImportRowErrorDto {
  @ApiProperty({ description: 'Row number in the sheet, as Excel shows it' })
  row: number;

  @ApiProperty({ enum: ReviewImportRowError })
  code: ReviewImportRowError;

  static fromEntity(failure: ReviewImportRowFailure): ReviewImportRowErrorDto {
    return Object.assign(new ReviewImportRowErrorDto(), {
      row: failure.row,
      code: failure.code,
    });
  }
}
