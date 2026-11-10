import { ApiProperty } from '@nestjs/swagger';
import { ReviewStaff } from '@prisma/client';

export class PublicReviewStaffDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ description: 'Name at the time of the visit' })
  name: string;

  static fromEntity(staff: ReviewStaff): PublicReviewStaffDto {
    return Object.assign(new PublicReviewStaffDto(), {
      id: staff.staffId,
      name: staff.staffName,
    });
  }
}
