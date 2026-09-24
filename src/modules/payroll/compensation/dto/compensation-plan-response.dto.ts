import { ApiProperty } from '@nestjs/swagger';
import { CompensationPlanWithRates } from '../interfaces/compensation-plan-with-rates.interface.js';
import { CompensationSalaryMode } from '../enums/compensation-salary-mode.enum.js';
import { CompensationServiceRateResponseDto } from './compensation-service-rate-response.dto.js';
import { dateOnlyStr, money } from '../../utils/money.js';

export class CompensationPlanResponseDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  staffId: string;

  @ApiProperty({ type: String, example: '2026-09-01' })
  effectiveFrom: string;

  @ApiProperty({ type: String, nullable: true, example: '2026-09-30' })
  effectiveTo: string | null;

  @ApiProperty({ type: String, nullable: true, example: '40000.00' })
  fixedSalaryAmount: string | null;

  @ApiProperty({ type: String, nullable: true, example: '15.00' })
  hourlyRate: string | null;

  @ApiProperty({ type: String, nullable: true, example: '30.00' })
  serviceCommissionPercent: string | null;

  @ApiProperty({ type: String, nullable: true, example: '10.00' })
  productCommissionPercent: string | null;

  @ApiProperty({ enum: CompensationSalaryMode, enumName: 'CompensationSalaryMode' })
  salaryMode: CompensationSalaryMode;

  @ApiProperty({ type: String, nullable: true })
  note: string | null;

  @ApiProperty({ type: () => CompensationServiceRateResponseDto, isArray: true })
  serviceRates: CompensationServiceRateResponseDto[];

  @ApiProperty({ type: Date })
  createdAt: Date;

  static fromEntity(plan: CompensationPlanWithRates): CompensationPlanResponseDto {
    const dto = new CompensationPlanResponseDto();
    dto.id = plan.id;
    dto.staffId = plan.staffId;
    dto.effectiveFrom = dateOnlyStr(plan.effectiveFrom);
    dto.effectiveTo = plan.effectiveTo ? dateOnlyStr(plan.effectiveTo) : null;
    dto.fixedSalaryAmount = plan.fixedSalaryAmount !== null ? money(plan.fixedSalaryAmount) : null;
    dto.hourlyRate = plan.hourlyRate !== null ? money(plan.hourlyRate) : null;
    dto.serviceCommissionPercent = plan.serviceCommissionPercent !== null ? money(plan.serviceCommissionPercent) : null;
    dto.productCommissionPercent = plan.productCommissionPercent !== null ? money(plan.productCommissionPercent) : null;
    dto.salaryMode = plan.salaryMode;
    dto.note = plan.note;
    dto.serviceRates = plan.serviceRates.map(CompensationServiceRateResponseDto.fromEntity);
    dto.createdAt = plan.createdAt;
    return dto;
  }
}
