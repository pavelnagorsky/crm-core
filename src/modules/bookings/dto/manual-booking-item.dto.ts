import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { IsOptionalPrice } from '../../../shared/decorators/is-price.decorator.js';

export class ManualBookingItemDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  serviceId: string;

  @ApiProperty({ type: String, format: 'uuid', required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  staffId?: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptionalPrice()
  customPrice?: string;
}
