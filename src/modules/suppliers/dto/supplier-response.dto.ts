import { ApiProperty } from '@nestjs/swagger';
import { Supplier } from '@prisma/client';

export class SupplierResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id: string;

  @ApiProperty({ type: String, format: 'uuid' })
  brandId: string;

  @ApiProperty({ type: String })
  name: string;

  @ApiProperty({ type: String, nullable: true })
  legalName: string | null;

  @ApiProperty({ type: String, nullable: true })
  taxId: string | null;

  @ApiProperty({ type: String, nullable: true })
  phone: string | null;

  @ApiProperty({ type: String, nullable: true })
  email: string | null;

  @ApiProperty({ type: String, nullable: true })
  contactPerson: string | null;

  @ApiProperty({ type: String, nullable: true })
  notes: string | null;

  @ApiProperty({ type: Boolean })
  isActive: boolean;

  @ApiProperty({ type: Date })
  createdAt: Date;

  @ApiProperty({ type: Date })
  updatedAt: Date;

  static fromEntity(entity: Supplier): SupplierResponseDto {
    const dto = new SupplierResponseDto();
    dto.id = entity.id;
    dto.brandId = entity.brandId;
    dto.name = entity.name;
    dto.legalName = entity.legalName;
    dto.taxId = entity.taxId;
    dto.phone = entity.phone;
    dto.email = entity.email;
    dto.contactPerson = entity.contactPerson;
    dto.notes = entity.notes;
    dto.isActive = entity.isActive;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }
}
