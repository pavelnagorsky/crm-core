import { ApiProperty } from '@nestjs/swagger';

export class PromotionReportPeriodDto {
  @ApiProperty({
    type: String,
    format: 'date',
    example: '2026-10-28',
    description: 'First calendar day of the period in the location timezone, inclusive.',
  })
  from: string;

  @ApiProperty({
    type: String,
    format: 'date',
    example: '2026-11-26',
    description: 'Last calendar day of the period in the location timezone, inclusive.',
  })
  to: string;
}
