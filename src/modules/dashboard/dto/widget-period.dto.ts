import { ApiProperty } from '@nestjs/swagger';

export class WidgetPeriodDto {
  @ApiProperty({ type: String, format: 'date-time' })
  from: string;

  @ApiProperty({ type: String, format: 'date-time' })
  to: string;
}
