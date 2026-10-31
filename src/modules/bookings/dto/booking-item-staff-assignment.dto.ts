import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class BookingItemStaffAssignmentDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  bookingItemId: string;

  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  staffId: string;
}
