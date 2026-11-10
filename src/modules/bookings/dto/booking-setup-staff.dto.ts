import { ApiProperty } from '@nestjs/swagger';
import { FileResponseDto } from '../../../shared/dto/file-response.dto.js';
import { sanitizeRichHtml } from '../../../shared/html/sanitize-rich-html.js';
import { ReviewStaffSummaryDto } from '../../reviews/dto/review-staff-summary.dto.js';
import { ReviewStaffSummary } from '../../reviews/interfaces/review-staff-summary.interface.js';
import { BookingStaff } from '../../staff/interfaces/booking-staff.interface.js';

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
    description:
      'Ids of services this staff member can perform. A bundle can be booked with them when they can perform every service in that bundle.',
  })
  serviceIds: string[];

  @ApiProperty({
    type: () => ReviewStaffSummaryDto,
    nullable: true,
    description:
      'Null when the staff member has no published reviews or reviews are disabled',
  })
  reviewSummary: ReviewStaffSummaryDto | null;

  static fromEntity(
    staff: BookingStaff,
    reviewSummary: ReviewStaffSummary | null = null,
  ): BookingSetupStaffDto {
    const dto = new BookingSetupStaffDto();
    dto.id = staff.id;
    dto.name = staff.name;
    dto.roleTitle = staff.roleTitle;
    dto.description = staff.description
      ? sanitizeRichHtml(staff.description)
      : null;
    dto.avatar = staff.avatarFile
      ? FileResponseDto.fromEntity(staff.avatarFile)
      : null;
    dto.serviceIds = staff.staffServices.map((ss) => ss.serviceId);
    dto.reviewSummary = reviewSummary
      ? ReviewStaffSummaryDto.fromSummary(reviewSummary)
      : null;
    return dto;
  }
}
