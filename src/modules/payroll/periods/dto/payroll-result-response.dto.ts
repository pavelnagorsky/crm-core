import { ApiProperty } from '@nestjs/swagger';
import { PayrollResult } from '@prisma/client';
import {
  ApiPrice,
  ApiSignedAmount,
} from '../../../../shared/decorators/api-decimal.decorator.js';
import { StaffEmploymentType } from '../../../staff/enums/staff-employment-type.enum.js';
import { StaffPayoutMethod } from '../../../staff/enums/staff-payout-method.enum.js';
import { MoneyService } from '../../../../shared/money/money.service.js';

export class PayrollResultResponseDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  periodId: string;

  @ApiProperty({ type: String })
  staffId: string;

  @ApiProperty({ type: String })
  staffName: string;

  @ApiProperty({ type: String, nullable: true })
  roleTitle: string | null;

  @ApiProperty({ type: String, nullable: true })
  taxId: string | null;

  @ApiProperty({ type: String, nullable: true })
  employeeNumber: string | null;

  @ApiProperty({
    enum: StaffEmploymentType,
    enumName: 'StaffEmploymentType',
    nullable: true,
  })
  employmentType: StaffEmploymentType | null;

  @ApiProperty({
    enum: StaffPayoutMethod,
    enumName: 'StaffPayoutMethod',
    nullable: true,
  })
  payoutMethod: StaffPayoutMethod | null;

  @ApiProperty({ type: String, nullable: true })
  payoutNote: string | null;

  @ApiProperty({ type: String })
  currency: string;

  @ApiPrice()
  fixedSalaryTotal: string;

  @ApiPrice()
  hourlyTotal: string;

  @ApiPrice()
  serviceCommissionTotal: string;

  @ApiPrice()
  productCommissionTotal: string;

  @ApiPrice()
  bonusTotal: string;

  @ApiSignedAmount()
  deductionTotal: string;

  @ApiSignedAmount()
  correctionTotal: string;

  @ApiSignedAmount()
  totalAmount: string;

  @ApiProperty({ type: Number })
  earningsCount: number;

  static fromEntity(result: PayrollResult): PayrollResultResponseDto {
    const dto = new PayrollResultResponseDto();
    dto.id = result.id;
    dto.periodId = result.periodId;
    dto.staffId = result.staffId;
    dto.staffName = result.staffName;
    dto.roleTitle = result.roleTitle;
    dto.taxId = result.taxId;
    dto.employeeNumber = result.employeeNumber;
    dto.employmentType = result.employmentType;
    dto.payoutMethod = result.payoutMethod;
    dto.payoutNote = result.payoutNote;
    dto.currency = result.currency;
    dto.fixedSalaryTotal = MoneyService.format(result.fixedSalaryTotal);
    dto.hourlyTotal = MoneyService.format(result.hourlyTotal);
    dto.serviceCommissionTotal = MoneyService.format(
      result.serviceCommissionTotal,
    );
    dto.productCommissionTotal = MoneyService.format(
      result.productCommissionTotal,
    );
    dto.bonusTotal = MoneyService.format(result.bonusTotal);
    dto.deductionTotal = MoneyService.format(result.deductionTotal);
    dto.correctionTotal = MoneyService.format(result.correctionTotal);
    dto.totalAmount = MoneyService.format(result.totalAmount);
    dto.earningsCount = result.earningsCount;
    return dto;
  }
}
