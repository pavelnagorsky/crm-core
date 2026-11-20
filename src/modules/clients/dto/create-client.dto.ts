import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { IsPhone } from '../../../shared/decorators/is-phone.decorator.js';
import { TRAFFIC_DETAIL_MAX_LENGTH } from '../../../shared/traffic/constants/traffic-limits.constants.js';
import { TrafficSource } from '../../../shared/traffic/enums/traffic-source.enum.js';

export class CreateClientDto {
  @ApiProperty({ type: String, maxLength: 100 })
  @IsString()
  @MaxLength(100)
  firstName: string;

  @ApiProperty({ type: String, maxLength: 100 })
  @IsString()
  @MaxLength(100)
  lastName: string;

  @IsPhone()
  phone: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiProperty({
    type: String,
    format: 'date',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @ApiProperty({ type: String, maxLength: 20, required: false, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  gender?: string;

  @ApiProperty({
    type: String,
    maxLength: 1000,
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiProperty({
    enum: TrafficSource,
    enumName: 'TrafficSource',
    required: false,
    nullable: true,
    description:
      'Where the client came from, when staff know it. Their first booking does not overwrite it.',
  })
  @IsOptional()
  @IsEnum(TrafficSource)
  acquisitionSource?: TrafficSource | null;

  @ApiProperty({
    type: String,
    maxLength: TRAFFIC_DETAIL_MAX_LENGTH,
    required: false,
    nullable: true,
    description:
      'Source detail ("Уточнение"). Needs a source (400 TRAFFIC_SOURCE_DETAIL_WITHOUT_SOURCE).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(TRAFFIC_DETAIL_MAX_LENGTH)
  acquisitionSourceDetail?: string | null;
}
