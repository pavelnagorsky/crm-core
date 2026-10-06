import { ApiProperty } from '@nestjs/swagger';
import { SlugAvailabilityReason } from '../enums/slug-availability-reason.enum.js';
import { SlugAvailability } from '../interfaces/slug-availability.interface.js';

export class SlugAvailabilityResponseDto {
  @ApiProperty({ type: Boolean })
  isAvailable: boolean;

  @ApiProperty({
    enum: SlugAvailabilityReason,
    enumName: 'SlugAvailabilityReason',
    nullable: true,
  })
  reason: SlugAvailabilityReason | null;

  static from(result: SlugAvailability): SlugAvailabilityResponseDto {
    const dto = new SlugAvailabilityResponseDto();
    dto.isAvailable = result.isAvailable;
    dto.reason = result.reason;
    return dto;
  }
}
