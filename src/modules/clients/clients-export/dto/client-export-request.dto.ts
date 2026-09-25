import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { OrderDirection } from '../../../../shared/enums/order-direction.enum.js';
import { ClientSearchOrderBy } from '../../enums/client-search-order-by.enum.js';

export class ClientExportRequestDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  businessId: string;

  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @ApiProperty({ enum: ClientSearchOrderBy, required: false })
  @IsOptional()
  @IsEnum(ClientSearchOrderBy)
  orderBy?: ClientSearchOrderBy;

  @ApiProperty({ enum: OrderDirection, required: false })
  @IsOptional()
  @IsEnum(OrderDirection)
  orderDirection?: OrderDirection;
}
