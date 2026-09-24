import { ApiProperty } from '@nestjs/swagger';
import { StaffCompensationServiceRate } from '@prisma/client';
import { money } from '../../utils/money.js';

export class CompensationServiceRateResponseDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  serviceId: string;

  @ApiProperty({ type: String, example: '40.00' })
  commissionPercent: string;

  static fromEntity(rate: StaffCompensationServiceRate): CompensationServiceRateResponseDto {
    const dto = new CompensationServiceRateResponseDto();
    dto.id = rate.id;
    dto.serviceId = rate.serviceId;
    dto.commissionPercent = money(rate.commissionPercent);
    return dto;
  }
}
