import { ApiProperty } from '@nestjs/swagger';

export class WidgetPeriodDto {
  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Inclusive: start of the first day of the period',
  })
  from: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Exclusive: start of the day after the last day',
  })
  to: string;
}
