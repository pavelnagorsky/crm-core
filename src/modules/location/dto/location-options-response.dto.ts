import { ApiProperty } from '@nestjs/swagger';
import { LocationCountryOptionDto } from './location-country-option.dto.js';

export class LocationOptionsResponseDto {
  @ApiProperty({ type: () => LocationCountryOptionDto, isArray: true })
  countries: LocationCountryOptionDto[];
}
