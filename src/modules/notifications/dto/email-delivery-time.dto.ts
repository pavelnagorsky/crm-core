import { ApiProperty } from '@nestjs/swagger';

/** From queueing to the SMTP server accepting the email, for queued emails sent in the period. */
export class EmailDeliveryTimeDto {
  @ApiProperty({ type: Number })
  medianSeconds: number;

  @ApiProperty({ type: Number })
  p95Seconds: number;
}
