import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { OrderDirection } from '../../../shared/enums/order-direction.enum.js';
import { BusinessSearchOrderBy } from '../enums/search-order-by.enum.js';

export class BusinessSearchRequestDto {
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @ApiProperty({ type: String, required: false, description: 'Filter by createdAt >= date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @ApiProperty({ type: String, required: false, description: 'Filter by createdAt <= date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  createdTo?: string;

  @ApiProperty({ enum: BusinessSearchOrderBy, required: false })
  @IsOptional()
  @IsEnum(BusinessSearchOrderBy)
  orderBy?: BusinessSearchOrderBy;

  @ApiProperty({ enum: OrderDirection, required: false })
  @IsOptional()
  @IsEnum(OrderDirection)
  orderDirection?: OrderDirection = OrderDirection.DESC;
}
