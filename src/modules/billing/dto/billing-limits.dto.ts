import { ApiProperty } from '@nestjs/swagger';
import { EffectiveLimits } from '../interfaces/effective-limits.interface.js';

export class BillingLimitsDto {
  @ApiProperty({ type: Number, nullable: true, description: 'null: unlimited' })
  staff: number | null;

  @ApiProperty({ type: Number, nullable: true, description: 'null: unlimited' })
  locations: number | null;

  static fromEntity(limits: EffectiveLimits): BillingLimitsDto {
    return Object.assign(new BillingLimitsDto(), {
      staff: limits.staff,
      locations: limits.locations,
    });
  }
}
