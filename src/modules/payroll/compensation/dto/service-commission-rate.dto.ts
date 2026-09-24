import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { IsPercent } from '../../../../shared/decorators/is-percent.decorator.js';

export class ServiceCommissionRateDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  serviceId: string;

  @IsPercent()
  commissionPercent: string;
}
