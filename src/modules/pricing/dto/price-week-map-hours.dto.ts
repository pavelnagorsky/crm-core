import { ApiProperty } from '@nestjs/swagger';

export class PriceWeekMapHoursDto {
  @ApiProperty({ type: Number, example: 9, description: 'First hour of the grid.' })
  from: number;

  @ApiProperty({ type: Number, example: 21, description: 'Hour the grid ends at.' })
  to: number;
}
