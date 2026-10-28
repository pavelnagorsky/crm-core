import { ApiProperty } from '@nestjs/swagger';
import { FileResponseDto } from '../../../shared/dto/file-response.dto.js';
import { StaffStatus } from '../enums/staff-status.enum.js';
import { StaffWithAvatar } from '../interfaces/staff-with-avatar.interface.js';

export class StaffDirectoryItemDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty({ type: String, nullable: true }) roleTitle: string | null;
  @ApiProperty({ enum: StaffStatus, enumName: 'StaffStatus' })
  status: StaffStatus;
  @ApiProperty({ type: () => FileResponseDto, nullable: true })
  avatar: FileResponseDto | null;

  static fromEntity(staff: StaffWithAvatar): StaffDirectoryItemDto {
    return Object.assign(new StaffDirectoryItemDto(), {
      id: staff.id,
      name: staff.name,
      roleTitle: staff.roleTitle,
      status: staff.status,
      avatar: staff.avatarFile
        ? FileResponseDto.fromEntity(staff.avatarFile)
        : null,
    });
  }
}
