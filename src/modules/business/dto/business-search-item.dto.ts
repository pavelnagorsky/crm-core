import { ApiProperty } from '@nestjs/swagger';
import { BusinessRole } from '@prisma/client';
import { BusinessWithCounts } from '../business.service.js';
import { FileResponseDto } from '../../../shared/dto/file-response.dto.js';

export class BusinessSearchItemDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  name: string;

  @ApiProperty({ type: () => FileResponseDto, nullable: true })
  logo: FileResponseDto | null;

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

  static fromEntity(b: BusinessWithCounts): BusinessSearchItemDto {
    const dto = new BusinessSearchItemDto();
    dto.id = b.id;
    dto.name = b.name;
    dto.logo = b.logoFile ? FileResponseDto.fromEntity(b.logoFile) : null;
    dto.timezone = b.timezone;
    dto.myRole = b.memberships[0]?.role ?? null;
    dto.staffCount = b._count.staff;
    dto.servicesCount = b._count.services;
    dto.clientsCount = b._count.clients;
    dto.createdAt = b.createdAt;
    return dto;
  }
}
