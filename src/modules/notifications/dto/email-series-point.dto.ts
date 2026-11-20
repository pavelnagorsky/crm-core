import { ApiProperty } from '@nestjs/swagger';

/** Emails queued within one bucket, by their current status. */
export class EmailSeriesPointDto {
  @ApiProperty({ type: String, format: 'date-time' })
  bucketStart: Date;

  @ApiProperty({ type: Number })
  sent: number;

  @ApiProperty({ type: Number })
  failed: number;

  @ApiProperty({ type: Number, description: 'Skipped or cancelled' })
  skipped: number;

  @ApiProperty({ type: Number })
  inProgress: number;
}
