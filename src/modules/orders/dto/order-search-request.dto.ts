import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { IsCalendarDate } from '../../../shared/time/decorators/is-calendar-date.validator.js';
import { PaginationRequestDto } from '../../../shared/dto/pagination-request.dto.js';
import { OrderSearchOrderBy } from '../enums/order-search-order-by.enum.js';
import { OrderStatus } from '../enums/order-status.enum.js';

export class OrderSearchRequestDto extends PaginationRequestDto<OrderSearchOrderBy> {
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @ApiProperty({ enum: OrderStatus, required: false })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiProperty({ type: String, format: 'uuid', required: false })
  @IsOptional()
  @IsUUID()
  orderId?: string;

  @ApiProperty({ type: String, format: 'uuid', required: false })
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiProperty({ type: String, format: 'uuid', required: false })
  @IsOptional()
  @IsUUID()
  bookingId?: string;

  @ApiProperty({ type: String, format: 'date-time', required: false })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiProperty({ type: String, format: 'date-time', required: false })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiProperty({
    type: String,
    format: 'date',
    required: false,
    description:
      'First order day (YYYY-MM-DD) in the location timezone, inclusive. Filters by occurredAt',
  })
  @IsOptional()
  @IsCalendarDate()
  dateFrom?: string;

  @ApiProperty({
    type: String,
    format: 'date',
    required: false,
    description:
      'Last order day (YYYY-MM-DD) in the location timezone, inclusive. Filters by occurredAt',
  })
  @IsOptional()
  @IsCalendarDate()
  dateTo?: string;

  @ApiProperty({ enum: OrderSearchOrderBy, required: false })
  @IsOptional()
  @IsEnum(OrderSearchOrderBy)
  declare orderBy?: OrderSearchOrderBy;
}
