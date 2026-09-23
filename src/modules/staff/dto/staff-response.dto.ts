import { ApiProperty } from '@nestjs/swagger';
import { StaffWithAvatar } from '../staff.service.js';
import { FileResponseDto } from '../../../shared/dto/file-response.dto.js';
import { StaffStatus } from '../enums/staff-status.enum.js';

export class StaffResponseDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  businessId: string;

  @ApiProperty({ type: String, nullable: true })
  userId: string | null;

  @ApiProperty({ type: () => FileResponseDto, nullable: true })
  avatar: FileResponseDto | null;

  @ApiProperty({ type: String })
  name: string;

  @ApiProperty({ type: String, nullable: true })
  phone: string | null;

  @ApiProperty({ type: String, nullable: true })
  email: string | null;

  @ApiProperty({ type: String, nullable: true })
  roleTitle: string | null;

  @ApiProperty({ enum: StaffStatus, enumName: 'StaffStatus' })
  status: StaffStatus;

  @ApiProperty({ type: Date })
  createdAt: Date;

  @ApiProperty({ type: Date })
  updatedAt: Date;

  static fromEntity(staff: StaffWithAvatar): StaffResponseDto {
    const dto = new StaffResponseDto();
    dto.id = staff.id;
    dto.businessId = staff.businessId;
    dto.userId = staff.userId;
    dto.avatar = staff.avatarFile ? FileResponseDto.fromEntity(staff.avatarFile) : null;
    dto.name = staff.name;
    dto.phone = staff.phone;
    dto.email = staff.email;
    dto.roleTitle = staff.roleTitle;
    dto.status = staff.status as StaffStatus;
    dto.createdAt = staff.createdAt;
    dto.updatedAt = staff.updatedAt;
    return dto;
  }
}
