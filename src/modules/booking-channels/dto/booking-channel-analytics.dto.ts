import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import regularExpressions from '../../../shared/regular-expressions.js';
import { TrimToNull } from '../decorators/trim.decorator.js';

export class BookingChannelAnalyticsDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 32,
    example: 'GTM-ABC1234',
    description:
      'Google Tag Manager container ID. Omit to preserve on update; null or blank disables the integration.',
  })
  @TrimToNull()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Matches(regularExpressions.googleTagManagerId)
  gtmId?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 15,
    example: '12345678',
    description:
      'Yandex Metrica counter ID as a positive decimal string. Omit to preserve on update; null or blank disables the integration.',
  })
  @TrimToNull()
  @IsOptional()
  @IsString()
  @MaxLength(15)
  @Matches(regularExpressions.yandexMetrikaId)
  yandexMetrikaId?: string | null;
}
