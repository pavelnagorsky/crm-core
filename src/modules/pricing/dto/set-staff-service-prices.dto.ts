import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { StaffServicePriceItemDto } from './staff-service-price-item.dto.js';

export class SetStaffServicePricesDto {
  @ApiProperty({
    type: () => StaffServicePriceItemDto,
    isArray: true,
    description:
      'Personal prices to change. A null price resets the personal price.',
  })
  @IsArray()
  @ArrayMaxSize(1000)
  @ArrayUnique((item: StaffServicePriceItemDto) => item.serviceId)
  @ValidateNested({ each: true })
  @Type(() => StaffServicePriceItemDto)
  items: StaffServicePriceItemDto[];
}
