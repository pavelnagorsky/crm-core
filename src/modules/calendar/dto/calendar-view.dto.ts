import { ApiProperty } from '@nestjs/swagger';

export class CalendarViewDto {
  @ApiProperty({
    type: String,
    description: 'Earliest shift start across the range, HH:mm',
  })
  minTime: string;

  @ApiProperty({
    type: String,
    description: 'Latest shift end across the range, HH:mm',
  })
  maxTime: string;
}
