import { ApiProperty } from '@nestjs/swagger';

/** Emails queued within the period, by their current status. */
export class EmailTotalsDto {
  @ApiProperty({ type: Number })
  total: number;

  @ApiProperty({ type: Number })
  sent: number;

  @ApiProperty({ type: Number })
  failed: number;

  @ApiProperty({ type: Number, description: 'Skipped or cancelled' })
  skipped: number;

  @ApiProperty({ type: Number, description: 'Queued, sending or retrying' })
  inProgress: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'sent / (sent + failed), 0..1; null without either',
  })
  successRate: number | null;
}
