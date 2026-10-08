import { CreateBookingDto } from './create-booking.dto.js';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsBoolean,
  IsArray,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { MULTI_SERVICE_MAX_ITEMS } from '../../services/constants/multi-service.constants.js';
import { BookingExecutionMode } from '../enums/booking-execution-mode.enum.js';
import { ManualBookingItemDto } from './manual-booking-item.dto.js';
import { BookingSource } from '../enums/booking-source.enum.js';
import { IsLocalDateTime } from '../../../shared/time/decorators/is-local-date-time.validator.js';
import { ManualBookingProductDto } from './manual-booking-product.dto.js';

export class ManualCreateBookingDto extends CreateBookingDto {
  @ApiProperty({
    type: Boolean,
    required: false,
    default: false,
    description:
      'Create the booking without linking or creating a client profile. Manual endpoint only.',
  })
  @IsOptional()
  @IsBoolean()
  anonymous?: boolean;

  @ApiProperty({
    enum: [BookingSource.MANUAL, BookingSource.WALK_IN],
    required: false,
    default: BookingSource.MANUAL,
  })
  @IsOptional()
  @IsIn([BookingSource.MANUAL, BookingSource.WALK_IN])
  source?: BookingSource.MANUAL | BookingSource.WALK_IN;

  @ApiProperty({
    type: () => ManualBookingItemDto,
    isArray: true,
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MULTI_SERVICE_MAX_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => ManualBookingItemDto)
  items?: ManualBookingItemDto[];

  @ApiProperty({ enum: BookingExecutionMode, required: false })
  @IsOptional()
  @IsEnum(BookingExecutionMode)
  executionMode?: BookingExecutionMode;

  @ApiProperty({
    type: String,
    maxLength: 2000,
    required: false,
    nullable: true,
    description:
      'Internal staff note saved atomically with the manual booking.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  internalNotes?: string | null;

  @ApiProperty({
    type: () => ManualBookingProductDto,
    isArray: true,
    required: false,
    description:
      'Draft product sale lines to attach to the booking order atomically.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ManualBookingProductDto)
  products?: ManualBookingProductDto[];

  @ApiProperty({
    type: String,
    example: '2026-09-20T10:30:00',
    required: false,
    description:
      'Local datetime in location timezone. Used only for WALK_IN to override actual end time.',
  })
  @IsOptional()
  @IsLocalDateTime()
  endAt?: string;
}
