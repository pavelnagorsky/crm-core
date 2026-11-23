import { ApiProperty } from '@nestjs/swagger';
import { PricedSlotsDay } from '../interfaces/priced-slots-day.interface.js';
import { PublicAvailableSlotItemDto } from './public-available-slot-item.dto.js';

export class PublicAvailableSlotsDayDto {
  @ApiProperty({ type: String, description: 'YYYY-MM-DD in business timezone' })
  date: string;

  @ApiProperty({ type: () => PublicAvailableSlotItemDto, isArray: true })
  slots: PublicAvailableSlotItemDto[];

  static fromResult(day: PricedSlotsDay): PublicAvailableSlotsDayDto {
    return {
      date: day.date,
      slots: day.slots.map(PublicAvailableSlotItemDto.fromResult),
    };
  }
}
