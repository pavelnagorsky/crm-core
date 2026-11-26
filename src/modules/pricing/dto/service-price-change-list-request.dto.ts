import { ApiProperty } from '@nestjs/swagger';
import { PriceChangeStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationRequestDto } from '../../../shared/dto/pagination-request.dto.js';

export class ServicePriceChangeListRequestDto extends PaginationRequestDto {
  @ApiProperty({
    enum: PriceChangeStatus,
    enumName: 'PriceChangeStatus',
    required: false,
  })
  @IsOptional()
  @IsEnum(PriceChangeStatus)
  status?: PriceChangeStatus;
}
