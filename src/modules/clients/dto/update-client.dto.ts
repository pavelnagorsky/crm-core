import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiPercent } from '../../../shared/decorators/api-decimal.decorator.js';
import { IsPhone } from '../../../shared/decorators/is-phone.decorator.js';
import regularExpressions from '../../../shared/regular-expressions.js';
import { CanonicalAmount } from '../../../shared/transforms/canonical-amount.transform.js';
import { TRAFFIC_DETAIL_MAX_LENGTH } from '../../../shared/traffic/constants/traffic-limits.constants.js';
import { TrafficSource } from '../../../shared/traffic/enums/traffic-source.enum.js';

export class UpdateClientDto {
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
      'Where the client came from. Omit to keep, null to clear (also clears the detail). A changed source without a detail clears the detail.',
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
      'Source detail ("Уточнение"). Omit to keep (unless the source changes), null to clear. Needs a source (400 TRAFFIC_SOURCE_DETAIL_WITHOUT_SOURCE).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(TRAFFIC_DETAIL_MAX_LENGTH)
  acquisitionSourceDetail?: string | null;

  @ApiPercent({
    required: false,
    nullable: true,
    example: '10.00',
    description:
      'Personal discount, percent above 0 and up to 100 (docs/pricing-stage4-api.md). Omit to keep, null to clear.',
  })
  @IsOptional()
  @CanonicalAmount()
  @Matches(regularExpressions.positivePercent, {
    message:
      'discountPercent must be above 0 and at most 100 with at most 2 decimal places',
  })
  discountPercent?: string | null;
}
