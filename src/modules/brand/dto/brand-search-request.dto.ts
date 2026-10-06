import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { OrderDirection } from '../../../shared/enums/order-direction.enum.js';
import { BrandSearchOrderBy } from '../enums/brand-search-order-by.enum.js';

export class BrandSearchRequestDto {
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsDateString()
  createdTo?: string;

  @ApiProperty({ enum: BrandSearchOrderBy, required: false })
  @IsOptional()
  @IsEnum(BrandSearchOrderBy)
  orderBy?: BrandSearchOrderBy;

  @ApiProperty({ enum: OrderDirection, required: false })
  @IsOptional()
  @IsEnum(OrderDirection)
  orderDirection?: OrderDirection = OrderDirection.DESC;
}
