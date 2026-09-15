import { ApiProperty } from '@nestjs/swagger';
import { Staff } from '@prisma/client';

export class StaffResponseDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  businessId: string;

  @ApiProperty({ type: String, nullable: true })
  userId: string | null;

  @ApiProperty({ type: String, nullable: true })
  avatarFileId: string | null;

  @ApiProperty({ type: String })
  name: string;

  @ApiProperty({ type: String, nullable: true })
  roleTitle: string | null;

  @ApiProperty({ type: Boolean })
  isActive: boolean;

  @ApiProperty({ type: Date })
  createdAt: Date;

  @ApiProperty({ type: Date })
  updatedAt: Date;

  static fromEntity(staff: Staff): StaffResponseDto {
    const dto = new StaffResponseDto();
    dto.id = staff.id;
    dto.businessId = staff.businessId;
    dto.userId = staff.userId;
    dto.avatarFileId = staff.avatarFileId;
    dto.name = staff.name;
    dto.roleTitle = staff.roleTitle;
    dto.isActive = staff.isActive;
    dto.createdAt = staff.createdAt;
    dto.updatedAt = staff.updatedAt;
    return dto;
  }
}
