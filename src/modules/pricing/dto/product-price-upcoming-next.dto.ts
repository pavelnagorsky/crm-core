import { ApiProperty } from '@nestjs/swagger';

export class ProductPriceUpcomingNextDto {
  @ApiProperty({ type: String, example: '2027-01-01' })
  effectiveDate: string;

  @ApiProperty({ type: String, format: 'uuid', isArray: true })
  changeIds: string[];

  @ApiProperty({ type: Number })
  changesCount: number;

  @ApiProperty({ type: Number })
  productsCount: number;
}
