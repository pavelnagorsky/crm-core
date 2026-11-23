import { ApiProperty } from '@nestjs/swagger';
import { PriceWeekMap } from '../interfaces/price-week-map.interface.js';
import { PriceWeekMapDayDto } from './price-week-map-day.dto.js';
import { PriceWeekMapHoursDto } from './price-week-map-hours.dto.js';

export class PriceWeekMapResponseDto {
  @ApiProperty({
    type: () => PriceWeekMapHoursDto,
    description:
      'Earliest shift start and latest shift end of the staff who perform the service that week; 9 to 21 without shifts.',
  })
  hours: PriceWeekMapHoursDto;

  @ApiProperty({ type: () => PriceWeekMapDayDto, isArray: true })
  days: PriceWeekMapDayDto[];

  static fromMap(map: PriceWeekMap): PriceWeekMapResponseDto {
    const dto = new PriceWeekMapResponseDto();
    dto.hours = Object.assign(new PriceWeekMapHoursDto(), map.hours);
    dto.days = map.days.map(PriceWeekMapDayDto.fromDay);
    return dto;
  }
}
