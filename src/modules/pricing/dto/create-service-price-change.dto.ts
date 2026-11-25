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
import { SERVICE_PRICE_CHANGE_MAX_ITEMS } from '../constants/service-price-change.constants.js';
import { ServicePriceChangeOverrideDto } from './service-price-change-override.dto.js';
import { ServicePriceChangeSpecDto } from './service-price-change-spec.dto.js';

export class CreateServicePriceChangeDto extends ServicePriceChangeSpecDto {
  @ApiProperty({
    type: String,
    isArray: true,
    description: 'Keys of the checked preview rows.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(SERVICE_PRICE_CHANGE_MAX_ITEMS)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  selectedKeys: string[];

  @ApiProperty({
    type: () => ServicePriceChangeOverrideDto,
    isArray: true,
    description: 'Manual new prices; every key is also in selectedKeys.',
  })
  @IsArray()
  @ArrayMaxSize(SERVICE_PRICE_CHANGE_MAX_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => ServicePriceChangeOverrideDto)
  overrides: ServicePriceChangeOverrideDto[];
}
