import { ApiProperty, PickType } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { BookingItemWithAdjustments } from '../interfaces/booking-item-with-adjustments.interface.js';
import { itemDiscount } from '../rules/booking-item-discount.rules.js';
import { BookingItemResponseDto } from './booking-item-response.dto.js';
import { ClientBookingDiscountDto } from './client-booking-discount.dto.js';

export class ClientBookingItemResponseDto extends PickType(
  BookingItemResponseDto,
  [
    'id',
    'serviceId',
    'serviceTitle',
    'serviceDuration',
    'staffId',
    'staffName',
    'startAt',
    'endAt',
  ] as const,
) {
  @ApiPrice()
  price: string;

  @ApiPrice({
    nullable: true,
    description:
      'Price list price, the old price next to a shown discount; null without one',
  })
  listPrice: string | null;

  @ApiProperty({
    type: () => ClientBookingDiscountDto,
    nullable: true,
    description:
      'Discount shown to the client; null without one, for a promotion not shown as one and for a custom price',
  })
  discount: ClientBookingDiscountDto | null;

  static fromBookingItem(
    item: BookingItemWithAdjustments,
  ): ClientBookingItemResponseDto {
    const discount =
      item.customPrice === null ? itemDiscount(item.priceAdjustments) : null;
    const publicTitle = discount?.publicTitle ?? null;
    return Object.assign(new ClientBookingItemResponseDto(), {
      id: item.id,
      serviceId: item.serviceId,
      serviceTitle: item.serviceTitle,
      serviceDuration: item.serviceDuration,
      staffId: item.staffId,
      staffName: item.staffName,
      startAt: item.startAt,
      endAt: item.endAt,
      price: MoneyUtils.format(item.customPrice ?? item.chargedPrice),
      listPrice:
        discount !== null && publicTitle !== null
          ? MoneyUtils.format(item.listPrice)
          : null,
      discount:
        discount !== null && publicTitle !== null
          ? ClientBookingDiscountDto.fromAdjustment({ ...discount, publicTitle })
          : null,
    });
  }
}
