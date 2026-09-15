import { ApiProperty } from '@nestjs/swagger';
import { Staff } from '@prisma/client';

export class PublicStaffDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  name: string;

  @ApiProperty({ type: String, nullable: true })
  roleTitle: string | null;

  @ApiProperty({ type: String, nullable: true })
  avatarFileId: string | null;

  static fromEntity(staff: Staff): PublicStaffDto {
    const dto = new PublicStaffDto();
    dto.id = staff.id;
    dto.name = staff.name;
    dto.roleTitle = staff.roleTitle;
    dto.avatarFileId = staff.avatarFileId;
    return dto;
  }
}
