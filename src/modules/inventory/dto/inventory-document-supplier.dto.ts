import { ApiProperty } from '@nestjs/swagger';

export class InventoryDocumentSupplierDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id: string;

  @ApiProperty({ type: String })
  name: string;

  static fromSnapshot(
    id: string | null,
    name: string | null,
  ): InventoryDocumentSupplierDto | null {
    if (!id || !name) return null;
    const dto = new InventoryDocumentSupplierDto();
    dto.id = id;
    dto.name = name;
    return dto;
  }
}
