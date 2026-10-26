import { PickType } from '@nestjs/swagger';
import { BookingItem } from '@prisma/client';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { BookingItemResponseDto } from './booking-item-response.dto.js';

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

  static fromBookingItem(item: BookingItem): ClientBookingItemResponseDto {
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
    });
  }
}
