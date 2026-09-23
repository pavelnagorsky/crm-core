import { ApiProperty } from '@nestjs/swagger';
import { StaffWithAvatar } from '../../staff/staff.service.js';
import { FileResponseDto } from '../../../shared/dto/file-response.dto.js';

export class BookingSetupStaffDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  name: string;

  @ApiProperty({ type: String, nullable: true })
  roleTitle: string | null;

  @ApiProperty({ type: () => FileResponseDto, nullable: true })
  avatar: FileResponseDto | null;

  @ApiProperty({ type: [String] })
  serviceIds: string[];

  static fromEntity(staff: StaffWithAvatar & { staffServices: { serviceId: string }[] }): BookingSetupStaffDto {
    const dto = new BookingSetupStaffDto();
    dto.id = staff.id;
    dto.name = staff.name;
    dto.roleTitle = staff.roleTitle;
    dto.avatar = staff.avatarFile ? FileResponseDto.fromEntity(staff.avatarFile) : null;
    dto.serviceIds = staff.staffServices.map((ss) => ss.serviceId);
    return dto;
  }
}
