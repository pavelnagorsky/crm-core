import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PaginationRequestDto } from '../../../shared/dto/pagination-request.dto.js';
import { ParseBoolean } from '../../../shared/transforms/parse-boolean.transform.js';
import { SupplierSearchOrderBy } from '../enums/supplier-search-order-by.enum.js';

export class SupplierSearchRequestDto extends PaginationRequestDto<SupplierSearchOrderBy> {
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @ApiProperty({ type: Boolean, required: false })
  @IsOptional()
  @IsBoolean()
  @ParseBoolean()
  isActive?: boolean;

  @ApiProperty({
    enum: SupplierSearchOrderBy,
    enumName: 'SupplierSearchOrderBy',
    required: false,
  })
  @IsOptional()
  @IsEnum(SupplierSearchOrderBy)
  declare orderBy?: SupplierSearchOrderBy;
}
