import { ApiProperty } from '@nestjs/swagger';

export class CalendarRangeDto {
  @ApiProperty({ type: String, description: 'YYYY-MM-DD' })
  from: string;

  @ApiProperty({ type: String, description: 'YYYY-MM-DD' })
  to: string;
}
