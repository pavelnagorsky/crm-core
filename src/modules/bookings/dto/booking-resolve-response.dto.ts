import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { BookingExecutionMode } from '../enums/booking-execution-mode.enum.js';
import { StaffSelectionMode } from '../enums/staff-selection-mode.enum.js';
import { BookingResolveStaffDto } from './booking-resolve-staff.dto.js';

export class BookingResolveResponseDto {
  @ApiProperty({
    type: String,
    isArray: true,
    description:
      'Service and bundle ids available for this selection. Without a staff member this is every active service and bundle. With a staff member, a service is included when they can perform it, and a bundle when they can perform every service in it.',
  })
  availableServiceIds: string[];

  @ApiProperty({ type: () => BookingResolveStaffDto, isArray: true })
  availableStaff: BookingResolveStaffDto[];

  @ApiProperty({ enum: StaffSelectionMode, enumName: 'StaffSelectionMode' })
  staffSelection: StaffSelectionMode;

  @ApiProperty({ enum: BookingExecutionMode, enumName: 'BookingExecutionMode' })
  executionMode: BookingExecutionMode;

  @ApiProperty({ type: Number })
  totalDuration: number;

  @ApiPrice()
  totalListPrice: string;
}
