import { ApiProperty } from '@nestjs/swagger';

export class ProductPriceImportCountsDto {
  @ApiProperty({ type: Number })
  products: number;

  @ApiProperty({ type: Number })
  rows: number;
}
