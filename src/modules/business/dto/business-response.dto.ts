import { ApiProperty } from '@nestjs/swagger';
import { Business } from '@prisma/client';

export class BusinessResponseDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  name: string;

  @ApiProperty({ type: String, nullable: true })
  logoFileId: string | null;

  @ApiProperty({ type: Number })
  advanceBookingWindowDays: number;

  @ApiProperty({ type: Number })
  slotIntervalMinutes: number;

  @ApiProperty({ type: Number })
  minimumBookingNoticeMinutes: number;

  @ApiProperty({ type: String })
  timezone: string;

  @ApiProperty({ type: Date })
  createdAt: Date;

  @ApiProperty({ type: Date })
  updatedAt: Date;

  static fromEntity(business: Business): BusinessResponseDto {
    const dto = new BusinessResponseDto();
    dto.id = business.id;
    dto.name = business.name;
    dto.logoFileId = business.logoFileId;
    dto.advanceBookingWindowDays = business.advanceBookingWindowDays;
    dto.slotIntervalMinutes = business.slotIntervalMinutes;
    dto.minimumBookingNoticeMinutes = business.minimumBookingNoticeMinutes;
    dto.timezone = business.timezone;
    dto.createdAt = business.createdAt;
    dto.updatedAt = business.updatedAt;
    return dto;
  }
}
