import { ApiProperty } from '@nestjs/swagger';

export class EmailSettingsDto {
  @ApiProperty({
    description:
      'False on dev/stage: client emails are logged as skipped, not sent',
  })
  clientNotificationsEnabled: boolean;

  @ApiProperty()
  sender: string;

  @ApiProperty()
  smtpHost: string;

  @ApiProperty({ type: Number })
  smtpPort: number;

  @ApiProperty({ description: 'The job queue is running' })
  queueReady: boolean;

  @ApiProperty({ type: Number, description: 'Automatic attempts per email' })
  maxAttempts: number;

  @ApiProperty({
    type: Number,
    description: 'Shortest time from the first to the last automatic attempt',
  })
  retryWindowMinutes: number;

  @ApiProperty({ type: Number, description: 'Parallel sends per server' })
  workerConcurrency: number;

  @ApiProperty({ type: Number, description: 'Days the log keeps an email' })
  retentionDays: number;
}
