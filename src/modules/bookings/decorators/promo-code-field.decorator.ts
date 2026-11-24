import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Promo code a visit is priced with (docs/pricing-stage4-api.md): trimmed, upper-cased, an
 * empty one is none. Any text up to 32 characters is accepted; an unknown code is reported
 * as NOT_FOUND in the price, not rejected.
 */
export function PromoCodeField() {
  return applyDecorators(
    ApiProperty({
      type: String,
      maxLength: 32,
      required: false,
      nullable: true,
      example: 'AUTUMN',
      description:
        'Promo code, compared case-insensitively. The result is promoCode { code, status, reason } of the price.',
    }),
    Transform(({ value }: { value: unknown }) => {
      if (typeof value !== 'string') return value;
      const code = value.trim().toUpperCase();
      return code === '' ? undefined : code;
    }),
    IsOptional(),
    IsString(),
    MaxLength(32),
  );
}
