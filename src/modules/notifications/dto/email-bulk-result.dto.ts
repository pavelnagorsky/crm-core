import { ApiProperty } from '@nestjs/swagger';

export class EmailBulkResultDto {
  @ApiProperty({ type: Number, description: 'Emails retried or cancelled' })
  affected: number;

  @ApiProperty({
    type: Number,
    description:
      'Selected emails left as they were: the action is not allowed for them',
  })
  skipped: number;
}
