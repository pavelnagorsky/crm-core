import { ApiProperty } from '@nestjs/swagger';
import { StaffEarning } from '@prisma/client';
import {
  ApiDecimal,
  ApiPercent,
  ApiPrice,
  ApiSignedAmount,
} from '../../../../shared/decorators/api-decimal.decorator.js';
import { StaffEarningSource } from '../enums/staff-earning-source.enum.js';
import { StaffEarningType } from '../enums/staff-earning-type.enum.js';
import { MoneyService } from '../../../../shared/money/money.service.js';
import { TimeService } from '../../../time/time.service.js';

export class StaffEarningResponseDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  staffId: string;

  @ApiProperty({ enum: StaffEarningType, enumName: 'StaffEarningType' })
  type: StaffEarningType;

  @ApiProperty({ enum: StaffEarningSource, enumName: 'StaffEarningSource' })
  source: StaffEarningSource;

  @ApiProperty({ type: String, example: '2026-09-15' })
  earnedOn: string;

  @ApiSignedAmount({ example: '20.00' })
  amount: string;

  @ApiProperty({ type: String })
  currency: string;

  @ApiPrice({ nullable: true })
  baseAmount: string | null;

  @ApiPercent({ nullable: true })
  ratePercent: string | null;

  @ApiPrice({ nullable: true })
  rateAmount: string | null;

  @ApiDecimal({ nullable: true })
  quantity: string | null;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty({ type: String, nullable: true })
  reason: string | null;

  @ApiProperty({ type: String, nullable: true })
  actorName: string | null;

  @ApiProperty({ type: String, nullable: true })
  bookingId: string | null;

  @ApiProperty({ type: String, nullable: true })
  shiftId: string | null;

  @ApiProperty({ type: String, nullable: true })
  externalId: string | null;

  @ApiProperty({ type: String, nullable: true })
  reversesEarningId: string | null;

  @ApiProperty({ type: String, nullable: true })
  correctsPayrollResultId: string | null;

  @ApiProperty({ type: String, nullable: true })
  payrollResultId: string | null;

  @ApiProperty({ type: Date })
  createdAt: Date;

  static fromEntity(earning: StaffEarning): StaffEarningResponseDto {
    const dto = new StaffEarningResponseDto();
    dto.id = earning.id;
    dto.staffId = earning.staffId;
    dto.type = earning.type;
    dto.source = earning.source;
    dto.earnedOn = TimeService.dateOnlyStr(earning.earnedOn);
    dto.amount = MoneyService.format(earning.amount);
    dto.currency = earning.currency;
    dto.baseAmount =
      earning.baseAmount !== null
        ? MoneyService.format(earning.baseAmount)
        : null;
    dto.ratePercent =
      earning.ratePercent !== null
        ? MoneyService.format(earning.ratePercent)
        : null;
    dto.rateAmount =
      earning.rateAmount !== null
        ? MoneyService.format(earning.rateAmount)
        : null;
    dto.quantity =
      earning.quantity !== null ? MoneyService.format(earning.quantity) : null;
    dto.description = earning.description;
    dto.reason = earning.reason;
    dto.actorName = earning.actorName;
    dto.bookingId = earning.bookingId;
    dto.shiftId = earning.shiftId;
    dto.externalId = earning.externalId;
    dto.reversesEarningId = earning.reversesEarningId;
    dto.correctsPayrollResultId = earning.correctsPayrollResultId;
    dto.payrollResultId = earning.payrollResultId;
    dto.createdAt = earning.createdAt;
    return dto;
  }
}
