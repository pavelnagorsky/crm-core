import { ApiProperty } from '@nestjs/swagger';
import { Staff } from '@prisma/client';
import { StaffStatus } from '../enums/staff-status.enum.js';

export class StaffDirectoryItemDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty({ type: String, nullable: true }) roleTitle: string | null;
  @ApiProperty({ enum: StaffStatus, enumName: 'StaffStatus' })
  status: StaffStatus;

  static fromEntity(staff: Staff): StaffDirectoryItemDto {
    return Object.assign(new StaffDirectoryItemDto(), {
      id: staff.id,
      name: staff.name,
      roleTitle: staff.roleTitle,
      status: staff.status,
    });
  }
}
