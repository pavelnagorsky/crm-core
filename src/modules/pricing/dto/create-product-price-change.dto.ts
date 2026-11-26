import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PRICE_CHANGE_MAX_ITEMS } from '../constants/price-change.constants.js';
import { ProductPriceChangeOverrideDto } from './product-price-change-override.dto.js';
import { ProductPriceChangeSpecDto } from './product-price-change-spec.dto.js';

export class CreateProductPriceChangeDto extends ProductPriceChangeSpecDto {
  @ApiProperty({
    type: String,
    isArray: true,
    description: 'Keys of the checked preview rows.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(PRICE_CHANGE_MAX_ITEMS)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  selectedKeys: string[];

  @ApiProperty({
    type: () => ProductPriceChangeOverrideDto,
    isArray: true,
    description: 'Manual new prices; every key is also in selectedKeys.',
  })
  @IsArray()
  @ArrayMaxSize(PRICE_CHANGE_MAX_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => ProductPriceChangeOverrideDto)
  overrides: ProductPriceChangeOverrideDto[];
}
