import { ApiProperty } from '@nestjs/swagger';
import { IsLocalDateTime } from '../../../shared/time/decorators/is-local-date-time.validator.js';
import { AvailableSlotsRequestDto } from './available-slots-request.dto.js';

export class SlotCheckRequestDto extends AvailableSlotsRequestDto {
  @ApiProperty({
    type: String,
    example: '2026-11-20T14:00:00',
    description: 'Visit start, local datetime in the location timezone',
  })
  @IsLocalDateTime()
  startAt: string;
}
