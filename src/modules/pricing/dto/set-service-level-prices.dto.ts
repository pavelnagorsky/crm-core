import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { ServiceLevelPriceItemDto } from './service-level-price-item.dto.js';

export class SetServiceLevelPricesDto {
  @ApiProperty({
    type: () => ServiceLevelPriceItemDto,
    isArray: true,
    description:
      'Only the levels to change. A null price resets the level to the base price.',
  })
  @IsArray()
  @ArrayMaxSize(200)
  @ArrayUnique((item: ServiceLevelPriceItemDto) => item.levelId)
  @ValidateNested({ each: true })
  @Type(() => ServiceLevelPriceItemDto)
  items: ServiceLevelPriceItemDto[];
}
