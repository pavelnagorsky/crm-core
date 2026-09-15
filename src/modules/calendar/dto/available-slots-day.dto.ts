import { ApiProperty } from '@nestjs/swagger';
import { AvailableSlotItemDto } from './available-slot-item.dto.js';

export class AvailableSlotsDayDto {
  @ApiProperty({ type: String, description: 'YYYY-MM-DD in business timezone' })
  date: string;

  @ApiProperty({ type: () => AvailableSlotItemDto, isArray: true })
  slots: AvailableSlotItemDto[];
}
