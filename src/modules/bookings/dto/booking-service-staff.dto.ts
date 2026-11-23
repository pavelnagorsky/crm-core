import { ApiProperty } from '@nestjs/swagger';
import { BookingServiceStaff } from '../interfaces/booking-service-staff.interface.js';
import { BookingResolveStaffDto } from './booking-resolve-staff.dto.js';

export class BookingServiceStaffDto {
  @ApiProperty({ type: String, format: 'uuid' })
  serviceId: string;

  @ApiProperty({ type: () => BookingResolveStaffDto, isArray: true })
  availableStaff: BookingResolveStaffDto[];

  static fromResult(entry: BookingServiceStaff): BookingServiceStaffDto {
    return {
      serviceId: entry.serviceId,
      availableStaff: entry.availableStaff.map(
        BookingResolveStaffDto.fromResult,
      ),
    };
  }
}
