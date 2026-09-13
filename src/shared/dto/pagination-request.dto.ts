import { IsBoolean, IsNumber, Min, ValidateIf } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PaginationRequestDto<OrderByType = number> {
  @ApiProperty({ type: Number, description: 'Page' })
  @IsNumber()
  page: number;

  @ApiProperty({ type: Number, description: 'Items per page' })
  @IsNumber()
  @Min(1)
  pageSize: number;

  @ApiProperty({ type: Number, description: 'Order by' })
  @IsNumber()
  @ValidateIf((object, value) => typeof value === 'number')
  orderBy?: OrderByType;

  @ApiProperty({ type: Boolean, description: 'Is order direction ASC' })
  @IsBoolean()
  @ValidateIf((object, value) => typeof value !== 'undefined')
  orderAsc?: boolean;
}
