import { ApiProperty } from '@nestjs/swagger';
import { StaffAssignments } from '../../../shared/scheduling/decorators/staff-assignments.decorator.js';
import { StaffAssignmentDto } from '../../../shared/scheduling/dto/staff-assignment.dto.js';
import { IsLocalDateTime } from '../../../shared/time/decorators/is-local-date-time.validator.js';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { MULTI_SERVICE_MAX_ITEMS } from '../../services/constants/multi-service.constants.js';

export class BookingResolveRequestDto {
  @StaffAssignments()
  staffAssignments?: StaffAssignmentDto[];

  @ApiProperty({
    type: String,
    required: false,
    description:
      'Local start time for a team preview. Does not reserve a slot.',
  })
  @IsOptional()
  @IsLocalDateTime()
  startAt?: string;

  @ApiProperty({
    type: String,
    required: false,
    description:
      'Explicit manual end time for the preview. Uses the same interval semantics as manual creation.',
  })
  @IsOptional()
  @IsLocalDateTime()
  endAt?: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    isArray: true,
    required: false,
    description: 'Service ids being booked. Mutually exclusive with bundleId.',
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MULTI_SERVICE_MAX_ITEMS)
  @IsUUID(undefined, { each: true })
  serviceIds?: string[];

  @ApiProperty({
    type: String,
    format: 'uuid',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  bundleId?: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  staffId?: string;
}
