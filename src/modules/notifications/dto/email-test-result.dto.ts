import { ApiProperty } from '@nestjs/swagger';
import { DirectEmailResult } from '../interfaces/direct-email-result.interface.js';

export class EmailTestResultDto {
  @ApiProperty({ description: 'The SMTP server accepted the email' })
  sent: boolean;

  @ApiProperty({ type: Number })
  durationMs: number;

  @ApiProperty({ type: String, nullable: true })
  providerMessageId: string | null;

  @ApiProperty({ type: String, nullable: true })
  error: string | null;

  @ApiProperty({ type: Number, nullable: true })
  errorCode: number | null;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'The test email in the log',
  })
  messageId: string | null;

  static from(result: DirectEmailResult): EmailTestResultDto {
    return {
      sent: result.sent,
      durationMs: result.durationMs,
      providerMessageId: result.providerMessageId,
      error: result.error?.message ?? null,
      errorCode: result.error?.code ?? null,
      messageId: result.messageId,
    };
  }
}
