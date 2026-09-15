import { ApiProperty } from '@nestjs/swagger';

export class AvailableSlotItemDto {
  @ApiProperty({ type: String, description: 'Slot start time, HH:mm in business timezone' })
  time: string;
}
