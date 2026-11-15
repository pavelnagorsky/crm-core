import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationRequestDto } from '../../../shared/dto/pagination-request.dto.js';
import { SubscriptionEventOrderBy } from '../enums/subscription-event-order-by.enum.js';

export class SubscriptionEventsRequestDto extends PaginationRequestDto<SubscriptionEventOrderBy> {
  @ApiPropertyOptional({
    enum: SubscriptionEventOrderBy,
    enumName: 'SubscriptionEventOrderBy',
  })
  @IsOptional()
  @IsEnum(SubscriptionEventOrderBy)
  declare orderBy?: SubscriptionEventOrderBy;
}
