import { ApiProperty } from '@nestjs/swagger';
import { BusinessRole } from '@prisma/client';

export class BusinessSearchItemDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  name: string;

  @ApiProperty({ type: String, nullable: true })
  logoFileId: string | null;

  @ApiProperty({ type: String })
  timezone: string;

  @ApiProperty({ enum: BusinessRole, nullable: true, description: 'Current user role in this business, or null for admins viewing all' })
  myRole: BusinessRole | null;

  @ApiProperty({ type: Number })
  staffCount: number;

  @ApiProperty({ type: Number })
  servicesCount: number;

  @ApiProperty({ type: Number })
  clientsCount: number;

  @ApiProperty({ type: Date })
  createdAt: Date;
}
