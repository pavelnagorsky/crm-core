import { ApiProperty } from '@nestjs/swagger';
import { BillingCountrySummary } from '../interfaces/billing-country-summary.interface.js';

export class BillingCountryDto {
  @ApiProperty({ example: 'BY' })
  countryCode: string;

  @ApiProperty({ example: 'BYN' })
  currency: string;

  @ApiProperty({ description: 'Plans with a price in force in this country' })
  plansWithPrices: number;

  @ApiProperty({ description: 'Subscriptions with this country of prices' })
  subscriptions: number;

  static fromEntity(value: BillingCountrySummary): BillingCountryDto {
    return Object.assign(new BillingCountryDto(), value);
  }
}
