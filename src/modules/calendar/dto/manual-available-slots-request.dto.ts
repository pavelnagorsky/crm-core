import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import {
  JsonObjectArray,
  JSON_OBJECT_ARRAY_MAX_LENGTH,
} from '../../../shared/transforms/json-object-array.transform.js';
import { MULTI_SERVICE_MAX_ITEMS } from '../../../shared/scheduling/constants/multi-service.constants.js';
import { BookingItemStaffAssignmentDto } from '../../bookings/dto/booking-item-staff-assignment.dto.js';
import { IsDateRangeValid } from '../../staff/decorators/is-date-range-valid.decorator.js';
import { AvailableSlotsRequestDto } from './available-slots-request.dto.js';

@IsDateRangeValid()
export class ManualAvailableSlotsRequestDto extends AvailableSlotsRequestDto {
  @ApiProperty({
    type: String,
    required: false,
    maxLength: JSON_OBJECT_ARRAY_MAX_LENGTH,
    description:
      'URL-encoded JSON array of { bookingItemId: UUID, staffId: UUID }, maximum 10 unique items. Requires bookingId. Omitted items keep their staff. Cannot be combined with staffId or service-level staffAssignments.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MULTI_SERVICE_MAX_ITEMS)
  @ArrayUnique((item: BookingItemStaffAssignmentDto) => item?.bookingItemId)
  @ValidateNested({ each: true })
  @JsonObjectArray(BookingItemStaffAssignmentDto, MULTI_SERVICE_MAX_ITEMS)
  itemStaffAssignments?: BookingItemStaffAssignmentDto[];

  @ApiProperty({
    type: String,
    example: '2026-10-01',
    description:
      'Start date (inclusive) YYYY-MM-DD. Dates before today in the business timezone are ignored.',
  })
  @IsDateString()
  from: string;

  @ApiProperty({
    type: String,
    example: '2026-10-31',
    description:
      'End date (inclusive) YYYY-MM-DD. The inclusive span cannot exceed 62 days.',
  })
  @IsDateString()
  to: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    required: false,
    description:
      'Booking being edited. Uses its saved services, staff and intervals instead of the current catalog; all linked calendar events are excluded.',
  })
  @IsOptional()
  @IsUUID()
  bookingId?: string;
}
