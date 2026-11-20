import { ApiProperty } from '@nestjs/swagger';
import { EmailStatus } from '@prisma/client';

export class EmailStatusCountDto {
  @ApiProperty({ enum: EmailStatus, enumName: 'EmailStatus' })
  status: EmailStatus;

  @ApiProperty({ type: Number })
  count: number;

  /** Every status, zeros included, in the enum order. */
  static list(counts: Map<EmailStatus, number>): EmailStatusCountDto[] {
    return Object.values(EmailStatus).map((status) => ({
      status,
      count: counts.get(status) ?? 0,
    }));
  }
}
