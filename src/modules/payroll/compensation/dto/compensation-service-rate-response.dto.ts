import { ApiProperty } from '@nestjs/swagger';
import { StaffCompensationServiceRate } from '@prisma/client';
import { ApiPercent } from '../../../../shared/decorators/api-decimal.decorator.js';
import { MoneyService } from '../../../../shared/money/money.service.js';

export class CompensationServiceRateResponseDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  serviceId: string;

  @ApiPercent({ example: '40.00' })
  commissionPercent: string;

  static fromEntity(
    rate: StaffCompensationServiceRate,
  ): CompensationServiceRateResponseDto {
    const dto = new CompensationServiceRateResponseDto();
    dto.id = rate.id;
    dto.serviceId = rate.serviceId;
    dto.commissionPercent = MoneyService.format(rate.commissionPercent);
    return dto;
  }
}
