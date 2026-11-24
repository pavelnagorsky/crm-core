import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { PromotionReport } from '../interfaces/promotion-report.interface.js';
import { PromotionNotReturnedClientDto } from './promotion-not-returned-client.dto.js';
import { PromotionNotReturnedDto } from './promotion-not-returned.dto.js';
import { PromotionReportStaffDto } from './promotion-report-staff.dto.js';

/**
 * Results of a promotion (docs/pricing-stage4-api.md, «Страница акции»): live bookings with a
 * visit in the period up to now and an item with the promotion.
 */
export class PromotionReportResponseDto {
  @ApiPrice({ description: 'What the items with the promotion cost.' })
  revenue: string;

  @ApiPrice({ description: 'Discounts given.' })
  discount: string;

  @ApiProperty({ type: Number })
  bookingsCount: number;

  @ApiProperty({ type: Number })
  clientsCount: number;

  @ApiProperty({
    type: Number,
    description: 'Clients for whom the booking was the first in the brand.',
  })
  newClients: number;

  @ApiProperty({ type: Number })
  returningClients: number;

  @ApiPrice({ description: 'Discount per booking.' })
  avgDiscount: string;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 0.42,
    description:
      'Share 0-1 of clients 14+ days after a completed promotion visit who booked again without the promotion; null when there are none.',
  })
  returnedRate: number | null;

  @ApiProperty({ type: () => PromotionReportStaffDto, isArray: true })
  staff: PromotionReportStaffDto[];

  @ApiProperty({ type: () => PromotionNotReturnedDto })
  notReturned: PromotionNotReturnedDto;

  static fromReport(report: PromotionReport): PromotionReportResponseDto {
    const dto = new PromotionReportResponseDto();
    dto.revenue = MoneyUtils.format(report.revenue);
    dto.discount = MoneyUtils.format(report.discount);
    dto.bookingsCount = report.bookingsCount;
    dto.clientsCount = report.clientsCount;
    dto.newClients = report.newClients;
    dto.returningClients = report.returningClients;
    dto.avgDiscount = MoneyUtils.format(report.avgDiscount);
    dto.returnedRate = report.returnedRate;
    dto.staff = report.staff.map(PromotionReportStaffDto.fromStaff);
    dto.notReturned = {
      count: report.notReturned.count,
      items: report.notReturned.items.map(
        PromotionNotReturnedClientDto.fromClient,
      ),
    };
    return dto;
  }
}
