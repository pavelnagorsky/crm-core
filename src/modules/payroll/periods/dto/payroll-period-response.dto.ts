import { ApiProperty } from '@nestjs/swagger';
import { PayrollPeriod } from '@prisma/client';
import { PayrollPeriodStatus } from '../enums/payroll-period-status.enum.js';
import { PayrollPeriodWithResults } from '../interfaces/payroll-period-with-results.interface.js';
import { TimeService } from '../../../time/time.service.js';
import { PayrollResultResponseDto } from './payroll-result-response.dto.js';

export class PayrollPeriodResponseDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  businessId: string;

  @ApiProperty({ type: String, nullable: true })
  name: string | null;

  @ApiProperty({ type: String })
  startDate: string;

  @ApiProperty({ type: String })
  endDate: string;

  @ApiProperty({ type: String })
  currency: string;

  @ApiProperty({ enum: PayrollPeriodStatus, enumName: 'PayrollPeriodStatus' })
  status: PayrollPeriodStatus;

  @ApiProperty({ type: Date, nullable: true })
  calculatedAt: Date | null;

  @ApiProperty({ type: Date, nullable: true })
  approvedAt: Date | null;

  @ApiProperty({ type: Date, nullable: true })
  paidAt: Date | null;

  @ApiProperty({ type: String, nullable: true })
  approvedByName: string | null;

  @ApiProperty({ type: String, nullable: true })
  paidByName: string | null;

  @ApiProperty({ type: () => PayrollResultResponseDto, isArray: true })
  results: PayrollResultResponseDto[];

  @ApiProperty({ type: Date })
  createdAt: Date;

  static fromEntity(period: PayrollPeriodWithResults | PayrollPeriod): PayrollPeriodResponseDto {
    const dto = new PayrollPeriodResponseDto();
    dto.id = period.id;
    dto.businessId = period.businessId;
    dto.name = period.name;
    dto.startDate = TimeService.dateOnlyStr(period.startDate);
    dto.endDate = TimeService.dateOnlyStr(period.endDate);
    dto.currency = period.currency;
    dto.status = period.status;
    dto.calculatedAt = period.calculatedAt;
    dto.approvedAt = period.approvedAt;
    dto.paidAt = period.paidAt;
    dto.approvedByName = period.approvedByName;
    dto.paidByName = period.paidByName;
    dto.results = ('results' in period ? period.results : []).map(PayrollResultResponseDto.fromEntity);
    dto.createdAt = period.createdAt;
    return dto;
  }
}
