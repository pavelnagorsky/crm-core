import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { PromotionPageReport } from '../interfaces/promotion-page-report.interface.js';
import { PromotionNotReturnedClientDto } from './promotion-not-returned-client.dto.js';
import { PromotionNotReturnedDto } from './promotion-not-returned.dto.js';
import { PromotionReportPeriodDto } from './promotion-report-period.dto.js';
import { PromotionReportPreviousDto } from './promotion-report-previous.dto.js';
import { PromotionReportProductDto } from './promotion-report-product.dto.js';
import { PromotionReportStaffDto } from './promotion-report-staff.dto.js';

/**
 * Results of a promotion (docs/pricing-stage4-api.md, docs/pricing-stage7-api.md,
 * docs/pricing-stage8-api.md «Страница акции»): confirmed or completed bookings whose visit
 * started in the period and an item with the promotion, and confirmed product lines with it
 * confirmed in the period (active orders), net of all posted returns.
 */
export class PromotionReportResponseDto {
  @ApiProperty({
    type: () => PromotionReportPeriodDto,
    description:
      'The period of the report as calendar days in the location timezone, both inclusive; the "all" period starts on the day the rule was created.',
  })
  period: PromotionReportPeriodDto;

  @ApiProperty({
    type: () => PromotionReportPreviousDto,
    nullable: true,
    description:
      'The same figures for the 30 or 90 days before the period; null for the period "all".',
  })
  previous: PromotionReportPreviousDto | null;

  @ApiPrice({ description: 'servicesRevenue + productsRevenue.' })
  revenue: string;

  @ApiPrice({ description: 'What the booking items with the promotion cost.' })
  servicesRevenue: string;

  @ApiPrice({ description: 'Σ lineTotal of the product lines with the promotion minus their returns.' })
  productsRevenue: string;

  @ApiPrice({ description: 'Σ discountTotal of the product lines minus the discount of their returns.' })
  productsDiscount: string;

  @ApiPrice({ description: 'Σ lineTotal of the returns of these product lines.' })
  productsReturned: string;

  @ApiProperty({ type: Number, description: 'Separate sales with the promotion.' })
  salesCount: number;

  @ApiProperty({
    type: () => PromotionReportProductDto,
    isArray: true,
    description: 'Top 20 products by revenue, net of returns.',
  })
  products: PromotionReportProductDto[];

  @ApiPrice({ description: 'Discounts given on booking items plus productsDiscount.' })
  discount: string;

  @ApiProperty({ type: Number })
  bookingsCount: number;

  @ApiProperty({
    type: Number,
    description: 'Distinct clients of the bookings and the product lines.',
  })
  clientsCount: number;

  @ApiProperty({
    type: Number,
    description: 'Clients for whom the booking was the first in the brand.',
  })
  newClients: number;

  @ApiProperty({ type: Number, description: 'clientsCount - newClients.' })
  returningClients: number;

  @ApiPrice({ description: 'Discount on booking items per booking.' })
  avgDiscount: string;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 0.42,
    description:
      'Share 0-1 of clients 14+ days after a promotion visit who booked again without the promotion; null when there are none.',
  })
  returnedRate: number | null;

  @ApiProperty({
    type: () => PromotionReportStaffDto,
    isArray: true,
    description:
      'Staff of the promotion visits and sellers of its products; a seller without visits has bookingsCount 0.',
  })
  staff: PromotionReportStaffDto[];

  @ApiProperty({ type: () => PromotionNotReturnedDto })
  notReturned: PromotionNotReturnedDto;

  static fromReport(report: PromotionPageReport): PromotionReportResponseDto {
    const dto = new PromotionReportResponseDto();
    dto.period = { from: report.period.from, to: report.period.to };
    dto.previous = report.previous
      ? PromotionReportPreviousDto.fromPrevious(report.previous)
      : null;
    dto.revenue = MoneyUtils.format(report.revenue);
    dto.servicesRevenue = MoneyUtils.format(report.servicesRevenue);
    dto.productsRevenue = MoneyUtils.format(report.productsRevenue);
    dto.productsDiscount = MoneyUtils.format(report.productsDiscount);
    dto.productsReturned = MoneyUtils.format(report.productsReturned);
    dto.salesCount = report.salesCount;
    dto.products = report.products.map(PromotionReportProductDto.fromProduct);
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
