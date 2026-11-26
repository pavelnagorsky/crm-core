import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { QuantityUtils } from '../../../shared/quantity/quantity.utils.js';
import { PriceAnalyticsItemType } from '../enums/price-analytics-item-type.enum.js';
import { PriceAnalyticsSource } from '../enums/price-analytics-source.enum.js';
import { PriceAnalyticsItem } from '../interfaces/price-analytics-item.interface.js';
import { PriceAnalyticsItemChangeDto } from './price-analytics-item-change.dto.js';
import { PriceAnalyticsPartyDto } from './price-analytics-party.dto.js';

/** A booking service or a product line whose price was changed. */
export class PriceAnalyticsItemDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'bookingItemId or orderItemId.' })
  id: string;

  @ApiProperty({
    enum: PriceAnalyticsSource,
    enumName: 'PriceAnalyticsSource',
    description: 'SALE - a separate sale; a visit product is BOOKING.',
  })
  source: PriceAnalyticsSource;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  bookingId: string | null;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Products only (the order of the visit or the sale).',
  })
  orderId: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Visit start of a service, confirmedAt of a product line.',
  })
  at: string;

  @ApiProperty({ enum: PriceAnalyticsItemType, enumName: 'PriceAnalyticsItemType' })
  itemType: PriceAnalyticsItemType;

  @ApiProperty({ type: String, description: 'Service or product title at the time of the item.' })
  title: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '2.000',
    description: 'Products only, three decimals.',
  })
  quantity: string | null;

  @ApiProperty({ type: () => PriceAnalyticsPartyDto, nullable: true })
  client: PriceAnalyticsPartyDto | null;

  @ApiProperty({
    type: () => PriceAnalyticsPartyDto,
    nullable: true,
    description: 'Staff member of the service or seller of the product.',
  })
  staff: PriceAnalyticsPartyDto | null;

  @ApiPrice()
  regular: string;

  @ApiPrice()
  surcharges: string;

  @ApiPrice()
  discounts: string;

  @ApiPrice()
  received: string;

  @ApiProperty({
    type: Boolean,
    description: 'A product line with a partial return; the amounts are already net of it.',
  })
  returned: boolean;

  @ApiProperty({
    type: () => PriceAnalyticsItemChangeDto,
    isArray: true,
    description: 'In the order of application: surcharges, then the discount or custom price.',
  })
  changes: PriceAnalyticsItemChangeDto[];

  static fromItem(item: PriceAnalyticsItem): PriceAnalyticsItemDto {
    const dto = new PriceAnalyticsItemDto();
    dto.id = item.id;
    dto.source = item.source;
    dto.bookingId = item.bookingId;
    dto.orderId = item.orderId;
    dto.at = item.at.toISOString();
    dto.itemType = item.itemType;
    dto.title = item.title;
    dto.quantity =
      item.quantity === null ? null : QuantityUtils.format(item.quantity);
    dto.client =
      item.clientId === null
        ? null
        : { id: item.clientId, name: item.clientName ?? '' };
    dto.staff =
      item.staffId === null
        ? null
        : { id: item.staffId, name: item.staffName ?? '' };
    dto.regular = MoneyUtils.format(item.regular);
    dto.surcharges = MoneyUtils.format(item.surcharges);
    dto.discounts = MoneyUtils.format(item.discounts);
    dto.received = MoneyUtils.format(item.received);
    dto.returned = item.returned;
    dto.changes = item.changes.map(PriceAnalyticsItemChangeDto.fromChange);
    return dto;
  }
}
