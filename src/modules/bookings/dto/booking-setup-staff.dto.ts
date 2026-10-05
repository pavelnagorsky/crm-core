import { ApiProperty } from '@nestjs/swagger';
import { StaffWithAvatar } from '../../staff/interfaces/staff-with-avatar.interface.js';
import { FileResponseDto } from '../../../shared/dto/file-response.dto.js';
import { sanitizeRichHtml } from '../../../shared/html/sanitize-rich-html.js';

export class BookingSetupStaffDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  name: string;

  @ApiProperty({ type: String, nullable: true })
  roleTitle: string | null;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty({ type: () => FileResponseDto, nullable: true })
  avatar: FileResponseDto | null;

  @ApiProperty({
    type: [String],
    description: 'Ids of services this staff member can perform. A bundle can be booked with them when they can perform every service in that bundle.',
  })
  serviceIds: string[];

  static fromEntity(staff: StaffWithAvatar & { staffServices: { serviceId: string }[] }): BookingSetupStaffDto {
    const dto = new BookingSetupStaffDto();
    dto.id = staff.id;
    dto.name = staff.name;
    dto.roleTitle = staff.roleTitle;
    dto.description = staff.description ? sanitizeRichHtml(staff.description) : null;
    dto.avatar = staff.avatarFile ? FileResponseDto.fromEntity(staff.avatarFile) : null;
    dto.serviceIds = staff.staffServices.map((ss) => ss.serviceId);
    return dto;
  }
}
