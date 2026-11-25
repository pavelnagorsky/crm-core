import { ApiProperty } from '@nestjs/swagger';
import { ServicePriceChangeStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationRequestDto } from '../../../shared/dto/pagination-request.dto.js';

export class ServicePriceChangeListRequestDto extends PaginationRequestDto {
  @ApiProperty({
    enum: ServicePriceChangeStatus,
    enumName: 'ServicePriceChangeStatus',
    required: false,
  })
  @IsOptional()
  @IsEnum(ServicePriceChangeStatus)
  status?: ServicePriceChangeStatus;
}
