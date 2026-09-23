import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { StaffStatus } from '../enums/staff-status.enum.js';

export class ChangeStaffStatusDto {
  @ApiProperty({ enum: StaffStatus, enumName: 'StaffStatus' })
  @IsEnum(StaffStatus)
  status: StaffStatus;
}
