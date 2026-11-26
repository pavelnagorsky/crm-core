import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { PriceAnalyticsStaffRow } from '../interfaces/price-analytics-staff-row.interface.js';

/** One row of the "По мастерам" table: staff of the services and sellers of the products. */
export class PriceAnalyticsStaffRowDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'null - items without a staff member or seller.',
  })
  staffId: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'null - "Без мастера".' })
  name: string | null;

  @ApiProperty({ type: String, nullable: true })
  avatarUrl: string | null;

  @ApiProperty({ type: Number })
  bookingsCount: number;

  @ApiProperty({ type: Number })
  salesCount: number;

  @ApiPrice()
  regular: string;

  @ApiPrice()
  surcharges: string;

  @ApiPrice()
  discounts: string;

  @ApiPrice({ description: 'Part of discounts: custom prices below the price list.' })
  customDiscounts: string;

  @ApiPrice()
  received: string;

  static fromRow(row: PriceAnalyticsStaffRow): PriceAnalyticsStaffRowDto {
    const dto = new PriceAnalyticsStaffRowDto();
    dto.staffId = row.staffId;
    dto.name = row.name;
    dto.avatarUrl = row.avatarUrl;
    dto.bookingsCount = row.bookingsCount;
    dto.salesCount = row.salesCount;
    dto.regular = MoneyUtils.format(row.regular);
    dto.surcharges = MoneyUtils.format(row.surcharges);
    dto.discounts = MoneyUtils.format(row.discounts);
    dto.customDiscounts = MoneyUtils.format(row.customDiscounts);
    dto.received = MoneyUtils.format(row.received);
    return dto;
  }
}
