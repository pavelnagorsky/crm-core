import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { PaginationRequestDto } from '../../../shared/dto/pagination-request.dto.js';
import {
  PUBLIC_BOOKING_PAGE_LIST_DEFAULT_PAGE_SIZE,
  PUBLIC_BOOKING_PAGE_LIST_MAX_PAGE_SIZE,
} from '../constants/public-booking-page-list.constants.js';

export class PublicBookingPageListRequestDto extends PaginationRequestDto {
  @ApiProperty({
    type: Number,
    default: PUBLIC_BOOKING_PAGE_LIST_DEFAULT_PAGE_SIZE,
    maximum: PUBLIC_BOOKING_PAGE_LIST_MAX_PAGE_SIZE,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PUBLIC_BOOKING_PAGE_LIST_MAX_PAGE_SIZE)
  override pageSize: number = PUBLIC_BOOKING_PAGE_LIST_DEFAULT_PAGE_SIZE;
}
