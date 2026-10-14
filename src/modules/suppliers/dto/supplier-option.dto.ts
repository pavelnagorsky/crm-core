import { ApiProperty } from '@nestjs/swagger';
import { SupplierOption } from '../interfaces/supplier-option.interface.js';

export class SupplierOptionDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id: string;

  @ApiProperty({ type: String })
  name: string;

  static fromEntity(entity: SupplierOption): SupplierOptionDto {
    const dto = new SupplierOptionDto();
    dto.id = entity.id;
    dto.name = entity.name;
    return dto;
  }
}
