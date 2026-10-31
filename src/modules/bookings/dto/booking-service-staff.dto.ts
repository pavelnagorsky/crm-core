import { ApiProperty } from '@nestjs/swagger';
import { BookingResolveStaffDto } from './booking-resolve-staff.dto.js';

export class BookingServiceStaffDto {
  @ApiProperty({ type: String, format: 'uuid' })
  serviceId: string;

  @ApiProperty({ type: () => BookingResolveStaffDto, isArray: true })
  availableStaff: BookingResolveStaffDto[];
}
