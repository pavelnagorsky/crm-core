import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { ServiceStaffPriceItemDto } from './service-staff-price-item.dto.js';

export class SetServiceStaffPricesDto {
  @ApiProperty({
    type: () => ServiceStaffPriceItemDto,
    isArray: true,
    description:
      'Personal prices to change. A null price resets the personal price.',
  })
  @IsArray()
  @ArrayMaxSize(1000)
  @ArrayUnique((item: ServiceStaffPriceItemDto) => item.staffId)
  @ValidateNested({ each: true })
  @Type(() => ServiceStaffPriceItemDto)
  items: ServiceStaffPriceItemDto[];
}
