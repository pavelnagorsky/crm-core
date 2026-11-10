import { ApiProperty } from '@nestjs/swagger';
import { ReviewStaffSummary } from '../interfaces/review-staff-summary.interface.js';

export class ReviewStaffSummaryDto {
  @ApiProperty()
  count: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'One decimal place; null until there are enough reviews',
  })
  average: number | null;

  static fromSummary(summary: ReviewStaffSummary): ReviewStaffSummaryDto {
    return Object.assign(new ReviewStaffSummaryDto(), {
      count: summary.count,
      average: summary.average,
    });
  }
}
