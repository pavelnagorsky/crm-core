import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { OrderDirection } from '../enums/order-direction.enum.js';

export class PaginationRequestDto<OrderBy extends string = string> {
  @ApiProperty({ type: Number, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiProperty({ type: Number, default: 25 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize: number = 25;

  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  orderBy?: OrderBy;

  @ApiProperty({ enum: OrderDirection, default: OrderDirection.DESC, required: false })
  @IsOptional()
  @IsEnum(OrderDirection)
  orderDirection?: OrderDirection = OrderDirection.DESC;

  @ApiProperty({ type: Boolean, required: false, description: 'When true, returns all records ignoring pagination' })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isExport?: boolean;
}
