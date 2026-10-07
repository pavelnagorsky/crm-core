import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { OrderTargetStatus } from '../enums/order-target-status.enum.js';

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: OrderTargetStatus, enumName: 'OrderTargetStatus' })
  @IsEnum(OrderTargetStatus)
  status: OrderTargetStatus;

  @ApiProperty({ type: String, maxLength: 500, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
