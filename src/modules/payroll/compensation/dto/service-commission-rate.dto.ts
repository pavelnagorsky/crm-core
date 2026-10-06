import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { IsPercent } from '../../../../shared/decorators/is-percent.decorator.js';

export class ServiceCommissionRateDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    description:
      'Service id. This rate overrides the plan serviceCommissionPercent for that service. Commission is calculated per booking item, so a bundle has no rate of its own.',
  })
  @IsUUID()
  serviceId: string;

  @IsPercent()
  commissionPercent: string;
}
