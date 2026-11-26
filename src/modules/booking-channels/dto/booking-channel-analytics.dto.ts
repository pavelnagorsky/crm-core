import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import regularExpressions from '../../../shared/regular-expressions.js';
import { TrimToNull } from '../decorators/trim.decorator.js';

export class BookingChannelAnalyticsDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 32,
    example: 'G-ABC123DEF4',
    pattern: regularExpressions.googleAnalyticsId.source,
    description:
      'Google Analytics 4 measurement ID. Omit to preserve on update; null or blank disables the integration.',
  })
  @TrimToNull()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Matches(regularExpressions.googleAnalyticsId)
  googleAnalyticsId?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 15,
    example: '12345678',
    pattern: regularExpressions.yandexMetrikaId.source,
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
