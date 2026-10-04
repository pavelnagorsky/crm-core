import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { BookingExecutionMode } from '../enums/booking-execution-mode.enum.js';
import { StaffSelectionMode } from '../enums/staff-selection-mode.enum.js';
import { BookingResolveStaffDto } from './booking-resolve-staff.dto.js';

export class BookingResolveResponseDto {
  @ApiProperty({ type: String, isArray: true })
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
