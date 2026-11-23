import { ApiProperty } from '@nestjs/swagger';
import { PriceWeekMapDay } from '../interfaces/price-week-map-day.interface.js';
import { PriceWeekMapSegmentDto } from './price-week-map-segment.dto.js';

export class PriceWeekMapDayDto {
  @ApiProperty({ type: String, example: '2026-12-01' })
  date: string;

  @ApiProperty({ type: () => PriceWeekMapSegmentDto, isArray: true })
  segments: PriceWeekMapSegmentDto[];

  static fromDay(day: PriceWeekMapDay): PriceWeekMapDayDto {
    const dto = new PriceWeekMapDayDto();
    dto.date = day.date;
    dto.segments = day.segments.map(PriceWeekMapSegmentDto.fromSegment);
    return dto;
  }
}
