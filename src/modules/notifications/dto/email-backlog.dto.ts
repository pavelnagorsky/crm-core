import { ApiProperty } from '@nestjs/swagger';

/** Emails waiting to be sent right now, whatever the period. */
export class EmailBacklogDto {
  @ApiProperty({ type: Number })
  count: number;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  oldestQueuedAt: Date | null;
}
