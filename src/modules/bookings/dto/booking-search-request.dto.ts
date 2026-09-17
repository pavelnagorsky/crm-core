import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationRequestDto } from '../../../shared/dto/pagination-request.dto.js';
import { BookingSearchOrderBy } from '../enums/booking-search-order-by.enum.js';
import { BookingStatus } from '../enums/booking-status.enum.js';

export class BookingSearchRequestDto extends PaginationRequestDto<BookingSearchOrderBy> {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  businessId: string;

  @ApiProperty({ enum: BookingStatus, required: false })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;

  @ApiProperty({ type: String, format: 'uuid', required: false })
  @IsOptional()
  @IsUUID()
  staffId?: string;

  @ApiProperty({ type: String, format: 'uuid', required: false })
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiProperty({ type: String, format: 'date-time', required: false })
  @IsOptional()
  @IsDateString()
  startFrom?: string;

  @ApiProperty({ type: String, format: 'date-time', required: false })
  @IsOptional()
  @IsDateString()
  startTo?: string;
}
