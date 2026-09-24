import { ApiProperty } from '@nestjs/swagger';
import { StaffEarning } from '@prisma/client';
import { StaffEarningSource } from '../enums/staff-earning-source.enum.js';
import { StaffEarningType } from '../enums/staff-earning-type.enum.js';
import { dateOnlyStr, money } from '../../utils/money.js';

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

  @ApiProperty({ type: String, example: '20.00' })
  amount: string;

  @ApiProperty({ type: String })
  currency: string;

  @ApiProperty({ type: String, nullable: true })
  baseAmount: string | null;

  @ApiProperty({ type: String, nullable: true })
  ratePercent: string | null;

  @ApiProperty({ type: String, nullable: true })
  rateAmount: string | null;

  @ApiProperty({ type: String, nullable: true })
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
    dto.earnedOn = dateOnlyStr(earning.earnedOn);
    dto.amount = money(earning.amount);
    dto.currency = earning.currency;
    dto.baseAmount = earning.baseAmount !== null ? money(earning.baseAmount) : null;
    dto.ratePercent = earning.ratePercent !== null ? money(earning.ratePercent) : null;
    dto.rateAmount = earning.rateAmount !== null ? money(earning.rateAmount) : null;
    dto.quantity = earning.quantity !== null ? money(earning.quantity) : null;
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
