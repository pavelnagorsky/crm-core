import { ApiProperty } from '@nestjs/swagger';
import { Business } from '@prisma/client';

export class BusinessPublicResponseDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  name: string;

  @ApiProperty({ type: String, nullable: true })
  logoFileId: string | null;

  @ApiProperty({ type: String })
  timezone: string;

  static fromEntity(business: Business): BusinessPublicResponseDto {
    const dto = new BusinessPublicResponseDto();
    dto.id = business.id;
    dto.name = business.name;
    dto.logoFileId = business.logoFileId;
    dto.timezone = business.timezone;
    return dto;
  }
}
