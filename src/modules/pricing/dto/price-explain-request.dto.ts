import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import regularExpressions from '../../../shared/regular-expressions.js';
import { IsCalendarDate } from '../../../shared/time/decorators/is-calendar-date.validator.js';
import { IsLocalDateTime } from '../../../shared/time/decorators/is-local-date-time.validator.js';
import { PromotionChannel } from '../engine/enums/promotion-channel.enum.js';
import { PriceExplainClientType } from '../enums/price-explain-client-type.enum.js';

export class PriceExplainRequestDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    required: false,
    description: 'A service; exactly one of serviceId and bundleId.',
  })
  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    required: false,
    description: 'A bundle; exactly one of serviceId and bundleId.',
  })
  @IsOptional()
  @IsUUID()
  bundleId?: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      'Staff member; null: "any staff" is assigned by the location rule.',
  })
  @ValidateIf((dto: PriceExplainRequestDto) => dto.staffId !== null)
  @IsUUID()
  staffId: string | null;

  @ApiProperty({
    type: String,
    example: '2026-12-05',
    description: 'Local date.',
  })
  @IsCalendarDate()
  date: string;

  @ApiProperty({
    type: String,
    example: '18:30',
    description: 'Local visit start.',
  })
  @Matches(regularExpressions.time)
  time: string;

  @ApiProperty({
    enum: PromotionChannel,
    enumName: 'PromotionChannel',
    required: false,
    default: PromotionChannel.ONLINE,
    description: 'Where the visit is booked: ONLINE (page, widget) or ADMIN.',
  })
  @IsOptional()
  @IsEnum(PromotionChannel)
  channel?: PromotionChannel;

  @ApiProperty({
    type: String,
    format: 'uuid',
    required: false,
    description:
      'A brand client: new or not, birthday, personal discount, promotion uses.',
  })
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiProperty({
    enum: PriceExplainClientType,
    enumName: 'PriceExplainClientType',
    required: false,
    description:
      'Without clientId: an imagined known client, new or regular. Missing: an unknown client (online before the phone).',
  })
  @IsOptional()
  @IsEnum(PriceExplainClientType)
  clientType?: PriceExplainClientType;

  @ApiProperty({ type: String, maxLength: 32, required: false })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() || undefined : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(32)
  promoCode?: string;

  @ApiProperty({
    type: String,
    required: false,
    example: '2026-12-01T10:00:00',
    description:
      'When the visit is booked, local time without an offset (booking period, lead time). Missing: now.',
  })
  @IsOptional()
  @IsLocalDateTime()
  bookedAt?: string;
}
