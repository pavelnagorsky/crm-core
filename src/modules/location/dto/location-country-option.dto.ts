import { ApiProperty } from '@nestjs/swagger';
import { CountryDefault } from '../../../shared/geo/interfaces/country-default.interface.js';

export class LocationCountryOptionDto {
  @ApiProperty({ type: String, example: 'BY' })
  countryCode: string;

  @ApiProperty({ type: String, example: 'BYN' })
  currency: string;

  @ApiProperty({ type: String, isArray: true, example: ['Europe/Minsk'] })
  timezones: string[];

  @ApiProperty({ type: String, example: 'Europe/Minsk' })
  defaultTimezone: string;

  constructor(countryCode: string, defaults: CountryDefault) {
    this.countryCode = countryCode;
    this.currency = defaults.currency;
    this.timezones = [...defaults.timezones];
    this.defaultTimezone = defaults.defaultTimezone;
  }
}
