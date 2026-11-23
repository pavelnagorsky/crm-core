import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { PriceWeekMapSegment } from '../interfaces/price-week-map-segment.interface.js';
import { minorToApi } from '../rules/pricing-money.rules.js';
import { PriceWeekMapAdjustmentDto } from './price-week-map-adjustment.dto.js';

export class PriceWeekMapSegmentDto {
  @ApiProperty({ type: String, example: '09:00' })
  start: string;

  @ApiProperty({ type: String, example: '17:00', description: 'HH:mm, 24:00 at the end of the day.' })
  end: string;

  @ApiPrice({ description: 'Price of a visit starting in the segment.' })
  price: string;

  @ApiPrice({ description: 'Price before surcharges: personal or level price.' })
  staffPrice: string;

  @ApiProperty({ type: () => PriceWeekMapAdjustmentDto, isArray: true })
  adjustments: PriceWeekMapAdjustmentDto[];

  static fromSegment(segment: PriceWeekMapSegment): PriceWeekMapSegmentDto {
    const dto = new PriceWeekMapSegmentDto();
    dto.start = TimeUtils.minutesToHHmm(segment.start);
    dto.end = TimeUtils.minutesToHHmm(segment.end);
    dto.price = minorToApi(segment.price);
    dto.staffPrice = minorToApi(segment.staffPrice);
    dto.adjustments = segment.adjustments.map(
      PriceWeekMapAdjustmentDto.fromAdjustment,
    );
    return dto;
  }
}
