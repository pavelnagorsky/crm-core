import { ApiProperty } from '@nestjs/swagger';
import { BillingUsage } from '../interfaces/billing-usage.interface.js';

export class BillingUsageDto {
  @ApiProperty({ description: 'Active staff in non-deleted locations' })
  staff: number;

  @ApiProperty({ description: 'Non-deleted locations' })
  locations: number;

  static fromEntity(usage: BillingUsage): BillingUsageDto {
    return Object.assign(new BillingUsageDto(), {
      staff: usage.staff,
      locations: usage.locations,
    });
  }
}
