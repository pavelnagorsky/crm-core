import { ApiProperty } from '@nestjs/swagger';
import { Staff } from '@prisma/client';

export class BookingSetupStaffDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  name: string;

  @ApiProperty({ type: String, nullable: true })
  roleTitle: string | null;

  @ApiProperty({ type: String, nullable: true })
  avatarFileId: string | null;

  @ApiProperty({ type: [String] })
  serviceIds: string[];

  static fromEntity(staff: Staff & { staffServices: { serviceId: string }[] }): BookingSetupStaffDto {
    const dto = new BookingSetupStaffDto();
    dto.id = staff.id;
    dto.name = staff.name;
    dto.roleTitle = staff.roleTitle;
    dto.avatarFileId = staff.avatarFileId;
    dto.serviceIds = staff.staffServices.map((ss) => ss.serviceId);
    return dto;
  }
}
