import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class ServicePriceChangeIncludeDto {
  @ApiProperty({ type: Boolean, description: 'Change the level prices.' })
  @IsBoolean()
  levelPrices: boolean;

  @ApiProperty({ type: Boolean, description: 'Change the personal prices of staff.' })
  @IsBoolean()
  staffPrices: boolean;

  @ApiProperty({ type: Boolean, description: 'Change the price of FIXED bundles.' })
  @IsBoolean()
  fixedBundles: boolean;
}
