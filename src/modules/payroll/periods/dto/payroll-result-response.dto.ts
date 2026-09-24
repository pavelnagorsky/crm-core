import { ApiProperty } from '@nestjs/swagger';
import { PayrollResult } from '@prisma/client';
import { StaffEmploymentType } from '../../../staff/enums/staff-employment-type.enum.js';
import { StaffPayoutMethod } from '../../../staff/enums/staff-payout-method.enum.js';
import { money } from '../../utils/money.js';

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

  @ApiProperty({ enum: StaffEmploymentType, enumName: 'StaffEmploymentType', nullable: true })
  employmentType: StaffEmploymentType | null;

  @ApiProperty({ enum: StaffPayoutMethod, enumName: 'StaffPayoutMethod', nullable: true })
  payoutMethod: StaffPayoutMethod | null;

  @ApiProperty({ type: String, nullable: true })
  payoutNote: string | null;

  @ApiProperty({ type: String })
  currency: string;

  @ApiProperty({ type: String })
  fixedSalaryTotal: string;

  @ApiProperty({ type: String })
  hourlyTotal: string;

  @ApiProperty({ type: String })
  serviceCommissionTotal: string;

  @ApiProperty({ type: String })
  productCommissionTotal: string;

  @ApiProperty({ type: String })
  bonusTotal: string;

  @ApiProperty({ type: String })
  deductionTotal: string;

  @ApiProperty({ type: String })
  correctionTotal: string;

  @ApiProperty({ type: String })
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
    dto.fixedSalaryTotal = money(result.fixedSalaryTotal);
    dto.hourlyTotal = money(result.hourlyTotal);
    dto.serviceCommissionTotal = money(result.serviceCommissionTotal);
    dto.productCommissionTotal = money(result.productCommissionTotal);
    dto.bonusTotal = money(result.bonusTotal);
    dto.deductionTotal = money(result.deductionTotal);
    dto.correctionTotal = money(result.correctionTotal);
    dto.totalAmount = money(result.totalAmount);
    dto.earningsCount = result.earningsCount;
    return dto;
  }
}
