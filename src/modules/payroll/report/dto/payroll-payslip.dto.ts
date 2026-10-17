import { ApiProperty } from '@nestjs/swagger';
import { PayrollResultResponseDto } from '../../periods/dto/payroll-result-response.dto.js';

export class PayrollPayslipDto {
  @ApiProperty({ type: () => PayrollResultResponseDto })
  result: PayrollResultResponseDto;
}
