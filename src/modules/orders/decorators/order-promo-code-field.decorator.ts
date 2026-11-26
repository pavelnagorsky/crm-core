import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches } from 'class-validator';

/**
 * Promo code of a sale: stored as entered, upper case, trimmed (docs/pricing-stage7-api.md).
 * Empty is null (no code). A visit order takes its code from the booking.
 */
export function OrderPromoCodeField(description: string) {
  return applyDecorators(
    ApiProperty({
      type: String,
      minLength: 3,
      maxLength: 32,
      pattern: '^[A-Z0-9_-]{3,32}$',
      required: false,
      nullable: true,
      example: 'AUTUMN',
      description,
    }),
    Transform(({ value }: { value: unknown }) => {
      if (typeof value !== 'string') return value;
      const code = value.trim().toUpperCase();
      return code === '' ? null : code;
    }),
    IsOptional(),
    IsString(),
    Matches(/^[A-Z0-9_-]{3,32}$/),
  );
}
