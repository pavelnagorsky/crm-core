import { ApiProperty } from '@nestjs/swagger';

export class ProductPriceChangeCountsDto {
  @ApiProperty({ type: Number })
  products: number;

  @ApiProperty({ type: Number })
  rows: number;

  @ApiProperty({ type: Number })
  changed: number;

  @ApiProperty({ type: Number })
  invalid: number;

  @ApiProperty({ type: Number, description: 'Rows whose new price is below the last purchase price.' })
  belowCost: number;
}
