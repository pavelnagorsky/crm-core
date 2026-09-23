import { ApiProperty } from '@nestjs/swagger';
import { StaffStatus } from '../enums/staff-status.enum.js';

export class StaffStatusCountResponseDto {
  @ApiProperty({ enum: StaffStatus, enumName: 'StaffStatus' })
  status: StaffStatus;

  @ApiProperty({ type: Number })
  count: number;
}
