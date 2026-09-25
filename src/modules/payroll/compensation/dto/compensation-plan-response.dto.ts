import { ApiProperty } from '@nestjs/swagger';
import {
  ApiPercent,
  ApiPrice,
} from '../../../../shared/decorators/api-decimal.decorator.js';
import { CompensationPlanWithRates } from '../interfaces/compensation-plan-with-rates.interface.js';
import { CompensationSalaryMode } from '../enums/compensation-salary-mode.enum.js';
import { CompensationServiceRateResponseDto } from './compensation-service-rate-response.dto.js';
import { MoneyService } from '../../../../shared/money/money.service.js';
import { TimeService } from '../../../time/time.service.js';

export class CompensationPlanResponseDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  staffId: string;

  @ApiProperty({ type: String, example: '2026-09-01' })
  effectiveFrom: string;

  @ApiProperty({ type: String, nullable: true, example: '2026-09-30' })
  effectiveTo: string | null;

  @ApiPrice({ nullable: true, example: '40000.00' })
  fixedSalaryAmount: string | null;

  @ApiPrice({ nullable: true, example: '15.00' })
  hourlyRate: string | null;

  @ApiPercent({ nullable: true })
  serviceCommissionPercent: string | null;

  @ApiPercent({ nullable: true, example: '10.00' })
  productCommissionPercent: string | null;

  @ApiProperty({
    enum: CompensationSalaryMode,
    enumName: 'CompensationSalaryMode',
  })
  salaryMode: CompensationSalaryMode;

  @ApiProperty({ type: String, nullable: true })
  note: string | null;

  @ApiProperty({
    type: () => CompensationServiceRateResponseDto,
    isArray: true,
  })
  serviceRates: CompensationServiceRateResponseDto[];

  @ApiProperty({ type: Date })
  createdAt: Date;

  static fromEntity(
    plan: CompensationPlanWithRates,
  ): CompensationPlanResponseDto {
    const dto = new CompensationPlanResponseDto();
    dto.id = plan.id;
    dto.staffId = plan.staffId;
    dto.effectiveFrom = TimeService.dateOnlyStr(plan.effectiveFrom);
    dto.effectiveTo = plan.effectiveTo
      ? TimeService.dateOnlyStr(plan.effectiveTo)
      : null;
    dto.fixedSalaryAmount =
      plan.fixedSalaryAmount !== null
        ? MoneyService.format(plan.fixedSalaryAmount)
        : null;
    dto.hourlyRate =
      plan.hourlyRate !== null ? MoneyService.format(plan.hourlyRate) : null;
    dto.serviceCommissionPercent =
      plan.serviceCommissionPercent !== null
        ? MoneyService.format(plan.serviceCommissionPercent)
        : null;
    dto.productCommissionPercent =
      plan.productCommissionPercent !== null
        ? MoneyService.format(plan.productCommissionPercent)
        : null;
    dto.salaryMode = plan.salaryMode;
    dto.note = plan.note;
    dto.serviceRates = plan.serviceRates.map(
      CompensationServiceRateResponseDto.fromEntity,
    );
    dto.createdAt = plan.createdAt;
    return dto;
  }
}
