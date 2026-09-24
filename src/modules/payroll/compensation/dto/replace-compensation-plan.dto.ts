import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsEnum, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { IsOptionalPrice } from '../../../../shared/decorators/is-price.decorator.js';
import { IsOptionalPercent } from '../../../../shared/decorators/is-percent.decorator.js';
import { CompensationSalaryMode } from '../enums/compensation-salary-mode.enum.js';
import { ServiceCommissionRateDto } from './service-commission-rate.dto.js';

export class ReplaceCompensationPlanDto {
  @ApiProperty({ type: String, example: '2026-10-01' })
  @IsDateString()
  effectiveFrom: string;

  @IsOptionalPrice()
  fixedSalaryAmount?: string;

  @IsOptionalPrice()
  hourlyRate?: string;

  @IsOptionalPercent()
  serviceCommissionPercent?: string;

  @IsOptionalPercent()
  productCommissionPercent?: string;

  @ApiProperty({ enum: CompensationSalaryMode, enumName: 'CompensationSalaryMode', required: false })
  @IsOptional()
  @IsEnum(CompensationSalaryMode)
  salaryMode?: CompensationSalaryMode;

  @ApiProperty({ type: String, required: false, nullable: true, maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiProperty({ type: () => ServiceCommissionRateDto, isArray: true, required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServiceCommissionRateDto)
  serviceRates?: ServiceCommissionRateDto[];
}
