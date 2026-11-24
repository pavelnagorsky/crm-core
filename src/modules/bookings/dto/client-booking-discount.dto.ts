import { ApiProperty } from '@nestjs/swagger';
import { BookingItemPriceAdjustment } from '@prisma/client';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';

/** A discount the client sees on their booking: its public title and size. */
export class ClientBookingDiscountDto {
  @ApiProperty({ type: String, description: 'Public title of the promotion or "Ваша скидка"' })
  title: string;

  @ApiPrice({ description: 'Discount, positive' })
  amount: string;

  static fromAdjustment(
    adjustment: BookingItemPriceAdjustment & { publicTitle: string },
  ): ClientBookingDiscountDto {
    const dto = new ClientBookingDiscountDto();
    dto.title = adjustment.publicTitle;
    dto.amount = MoneyUtils.format(adjustment.amount.neg());
    return dto;
  }
}
