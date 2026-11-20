import { ApiProperty } from '@nestjs/swagger';
import { EmailHealthStatus } from '../enums/email-health-status.enum.js';

/** SMTP health from the latest attempts of the last 24 hours. */
export class EmailHealthDto {
  @ApiProperty({
    enum: EmailHealthStatus,
    enumName: 'EmailHealthStatus',
    description:
      'OK: latest attempts succeed. DEGRADED: failures within the hour. DOWN: 3+ failures in a row or the queue is not running. IDLE: no attempts in 24h',
  })
  status: EmailHealthStatus;

  @ApiProperty({ type: Number })
  consecutiveFailures: number;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastSentAt: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastFailureAt: Date | null;

  @ApiProperty({ type: String, nullable: true })
  lastError: string | null;
}
