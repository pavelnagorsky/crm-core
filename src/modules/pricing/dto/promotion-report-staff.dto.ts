import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { PromotionReportStaffRow } from '../interfaces/promotion-report-staff-row.interface.js';

export class PromotionReportStaffDto {
  @ApiProperty({ type: String })
  staffId: string;

  @ApiProperty({ type: String })
  name: string;

  @ApiProperty({ type: String, nullable: true })
  avatarUrl: string | null;

  @ApiProperty({
    type: Number,
    description: 'Bookings with the promotion; 0 for a staff member who only sold products.',
  })
  bookingsCount: number;

  @ApiPrice({ description: 'Booking items with the promotion.' })
  revenue: string;

  @ApiPrice({ description: 'Discount on the booking items.' })
  discount: string;

  @ApiPrice({
    description: 'Product lines with the promotion sold by the staff member, net of returns.',
  })
  productsRevenue: string;

  static fromStaff(staff: PromotionReportStaffRow): PromotionReportStaffDto {
    const dto = new PromotionReportStaffDto();
    dto.staffId = staff.staffId;
    dto.name = staff.name;
    dto.avatarUrl = staff.avatarUrl;
    dto.bookingsCount = staff.bookingsCount;
    dto.revenue = MoneyUtils.format(staff.revenue);
    dto.discount = MoneyUtils.format(staff.discount);
    dto.productsRevenue = MoneyUtils.format(staff.productsRevenue);
    return dto;
  }
}
