import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { PromotionReportPrevious } from '../interfaces/promotion-report-previous.interface.js';

export class PromotionReportPreviousDto {
  @ApiPrice({ description: 'revenue of the previous period.' })
  revenue: string;

  @ApiPrice({ description: 'discount of the previous period.' })
  discount: string;

  @ApiProperty({ type: Number })
  bookingsCount: number;

  @ApiProperty({ type: Number })
  salesCount: number;

  @ApiProperty({ type: Number })
  clientsCount: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 0.42,
    description:
      'returnedRate among the visits of the previous period; null when none of its clients is due yet.',
  })
  returnedRate: number | null;

  static fromPrevious(
    previous: PromotionReportPrevious,
  ): PromotionReportPreviousDto {
    const dto = new PromotionReportPreviousDto();
    dto.revenue = MoneyUtils.format(previous.revenue);
    dto.discount = MoneyUtils.format(previous.discount);
    dto.bookingsCount = previous.bookingsCount;
    dto.salesCount = previous.salesCount;
    dto.clientsCount = previous.clientsCount;
    dto.returnedRate = previous.returnedRate;
    return dto;
  }
}
