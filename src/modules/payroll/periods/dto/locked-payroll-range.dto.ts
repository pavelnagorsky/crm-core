import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { TimeService } from '../../../time/time.service.js';

export class LockedPayrollRangesRequestDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  businessId: string;
}

export class LockedPayrollRangeDto {
  @ApiProperty({ type: String, example: '2026-09-01' })
  startDate: string;

  @ApiProperty({ type: String, example: '2026-09-30' })
  endDate: string;

  static fromEntity(range: { startDate: Date; endDate: Date }): LockedPayrollRangeDto {
    const dto = new LockedPayrollRangeDto();
    dto.startDate = TimeService.dateOnlyStr(range.startDate);
    dto.endDate = TimeService.dateOnlyStr(range.endDate);
    return dto;
  }
}
