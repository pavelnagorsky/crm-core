import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { ClientDiscountStats } from '../../bookings/interfaces/client-discount-stats.interface.js';

/** Use of the personal discounts, all time: live bookings (service or visit product discount, a visit once) and standalone sales. */
export class ClientDiscountStatsDto {
  @ApiProperty({ type: Number })
  bookingsCount: number;

  @ApiProperty({ type: Number })
  salesCount: number;

  @ApiPrice({ description: 'Sum of the personal discounts given, positive.' })
  amount: string;

  static fromStats(stats: ClientDiscountStats | undefined): ClientDiscountStatsDto {
    const dto = new ClientDiscountStatsDto();
    dto.bookingsCount = stats?.bookingsCount ?? 0;
    dto.salesCount = stats?.salesCount ?? 0;
    dto.amount = MoneyUtils.format(stats?.amount ?? 0);
    return dto;
  }
}
