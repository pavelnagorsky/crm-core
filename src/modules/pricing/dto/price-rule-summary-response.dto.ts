import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { PromotionSummary } from '../interfaces/promotion-summary.interface.js';

/** Cards above the promotion list: visits of the last 30 days and the 30 before them. */
export class PriceRuleSummaryResponseDto {
  @ApiProperty({ type: Number, description: 'Enabled promotions in force today.' })
  activeCount: number;

  @ApiProperty({ type: Number, description: 'Enabled promotions that start later.' })
  scheduledCount: number;

  @ApiProperty({ type: String, nullable: true, example: '2026-12-01' })
  nextStartDate: string | null;

  @ApiPrice({ description: 'What the items with a promotion cost, last 30 days.' })
  revenue30d: string;

  @ApiPrice({ description: 'The same for the 30 days before.' })
  revenuePrev30d: string;

  @ApiPrice({ description: 'Discounts given, last 30 days.' })
  discount30d: string;

  @ApiProperty({ type: Number })
  bookings30d: number;

  @ApiProperty({ type: Number, description: 'First bookings in the brand with a promotion.' })
  newClients30d: number;

  static fromSummary(summary: PromotionSummary): PriceRuleSummaryResponseDto {
    const dto = new PriceRuleSummaryResponseDto();
    dto.activeCount = summary.activeCount;
    dto.scheduledCount = summary.scheduledCount;
    dto.nextStartDate = summary.nextStartDate;
    dto.revenue30d = MoneyUtils.format(summary.current.revenue);
    dto.revenuePrev30d = MoneyUtils.format(summary.previous.revenue);
    dto.discount30d = MoneyUtils.format(summary.current.discount);
    dto.bookings30d = summary.current.bookingsCount;
    dto.newClients30d = summary.current.newClients;
    return dto;
  }
}
