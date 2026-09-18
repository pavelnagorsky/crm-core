import { ApiProperty } from '@nestjs/swagger';
import { BookingSetupServiceDto } from './booking-setup-service.dto.js';
import { BookingSetupStaffDto } from './booking-setup-staff.dto.js';

export class BookingSetupResponseDto {
  @ApiProperty({ type: () => BookingSetupServiceDto, isArray: true })
  services: BookingSetupServiceDto[];

  @ApiProperty({ type: () => BookingSetupStaffDto, isArray: true })
  staff: BookingSetupStaffDto[];
}
