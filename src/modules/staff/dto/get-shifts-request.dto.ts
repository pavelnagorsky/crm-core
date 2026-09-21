import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';
import { IsDateRangeValid } from '../decorators/is-date-range-valid.decorator.js';

@IsDateRangeValid()
export class GetShiftsRequestDto {
  @ApiProperty({
    type: String,
    example: '2026-10-01',
    description: 'Start date (inclusive) YYYY-MM-DD',
  })
  @IsDateString()
  from: string;

  @ApiProperty({
    type: String,
    example: '2026-10-31',
    description: 'End date (inclusive) YYYY-MM-DD',
  })
  @IsDateString()
  to: string;
}
