import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';
import regularExpressions from '../regular-expressions.js';
import { CanonicalQuantity } from '../transforms/canonical-quantity.transform.js';

const quantityOptions = {
  type: String,
  format: 'decimal',
  pattern: regularExpressions.quantity.source,
  example: '1.000',
  description: 'Non-negative quantity with up to 3 decimal places.',
} as const;

export const IsQuantity = (): PropertyDecorator => (target, propertyKey) => {
  ApiProperty(quantityOptions)(target, propertyKey);
  CanonicalQuantity()(target, propertyKey);
  Matches(regularExpressions.quantity, {
    message: `${String(propertyKey)} must be a non-negative quantity with at most 3 decimal places`,
  })(target, propertyKey);
};

export const IsOptionalQuantity =
  (): PropertyDecorator => (target, propertyKey) => {
    ApiProperty({ ...quantityOptions, required: false })(target, propertyKey);
    IsOptional()(target, propertyKey);
    CanonicalQuantity()(target, propertyKey);
    Matches(regularExpressions.quantity, {
      message: `${String(propertyKey)} must be a non-negative quantity with at most 3 decimal places`,
    })(target, propertyKey);
  };
