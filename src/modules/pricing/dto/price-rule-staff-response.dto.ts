import { ApiProperty } from '@nestjs/swagger';
import { PriceRuleStaffView } from '../interfaces/price-rule-staff-view.interface.js';

export class PriceRuleStaffResponseDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Current name; null when the staff member is gone.',
  })
  name: string | null;

  static fromView(staff: PriceRuleStaffView): PriceRuleStaffResponseDto {
    const dto = new PriceRuleStaffResponseDto();
    dto.id = staff.id;
    dto.name = staff.name;
    return dto;
  }
}
