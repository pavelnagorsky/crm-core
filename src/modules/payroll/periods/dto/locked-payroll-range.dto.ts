import { ApiProperty } from '@nestjs/swagger';
import { TimeUtils } from '../../../../shared/time/time.utils.js';

export class LockedPayrollRangeDto {
  @ApiProperty({ type: String, example: '2026-09-01' })
  startDate: string;

  @ApiProperty({ type: String, example: '2026-09-30' })
  endDate: string;

  static fromEntity(range: {
    startDate: Date;
    endDate: Date;
  }): LockedPayrollRangeDto {
    const dto = new LockedPayrollRangeDto();
    dto.startDate = TimeUtils.dateOnlyStr(range.startDate);
    dto.endDate = TimeUtils.dateOnlyStr(range.endDate);
    return dto;
  }
}
