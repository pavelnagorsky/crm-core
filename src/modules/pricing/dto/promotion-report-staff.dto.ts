import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { PromotionReportStaff } from '../interfaces/promotion-report-staff.interface.js';

export class PromotionReportStaffDto {
  @ApiProperty({ type: String })
  staffId: string;

  @ApiProperty({ type: String })
  name: string;

  @ApiProperty({ type: String, nullable: true })
  avatarUrl: string | null;

  @ApiProperty({ type: Number })
  bookingsCount: number;

  @ApiPrice()
  revenue: string;

  @ApiPrice()
  discount: string;

  static fromStaff(staff: PromotionReportStaff): PromotionReportStaffDto {
    const dto = new PromotionReportStaffDto();
    dto.staffId = staff.staffId;
    dto.name = staff.name;
    dto.avatarUrl = staff.avatarUrl;
    dto.bookingsCount = staff.bookingsCount;
    dto.revenue = MoneyUtils.format(staff.revenue);
    dto.discount = MoneyUtils.format(staff.discount);
    return dto;
  }
}
