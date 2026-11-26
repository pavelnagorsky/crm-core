import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, ValidateIf } from 'class-validator';
import { DashboardRangeDto } from '../../dashboard/dto/dashboard-range.dto.js';
import { PRICE_ANALYTICS_NO_STAFF } from '../constants/price-analytics.constants.js';
import { PriceAnalyticsItemType } from '../enums/price-analytics-item-type.enum.js';
import { PriceChangeReason } from '../enums/price-change-reason.enum.js';

/**
 * Period and filters of the items list and its export (docs/pricing-stage8-api.md,
 * «Позиции»). compareWithPrevious and groupBy are ignored.
 */
export class PriceAnalyticsItemsFilterDto extends DashboardRangeDto {
  @ApiProperty({
    enum: PriceChangeReason,
    enumName: 'PriceChangeReason',
    required: false,
    description: 'Items with this reason; their other changes are shown too.',
  })
  @IsOptional()
  @IsEnum(PriceChangeReason)
  reason?: PriceChangeReason;

  @ApiProperty({
    type: String,
    format: 'uuid',
    required: false,
    description:
      'Only with reason PROMOTION or SURCHARGE, otherwise 400 PRICE_ANALYTICS_FILTER_INVALID.',
  })
  @IsOptional()
  @IsUUID()
  ruleId?: string;

  @ApiProperty({
    type: String,
    required: false,
    description: `Staff member of the service or seller of the product (uuid); "${PRICE_ANALYTICS_NO_STAFF}" - items without one.`,
  })
  @IsOptional()
  @IsString()
  @ValidateIf((_object, value) => value !== PRICE_ANALYTICS_NO_STAFF)
  @IsUUID()
  staffId?: string;

  @ApiProperty({
    enum: PriceAnalyticsItemType,
    enumName: 'PriceAnalyticsItemType',
    required: false,
  })
  @IsOptional()
  @IsEnum(PriceAnalyticsItemType)
  itemType?: PriceAnalyticsItemType;
}
