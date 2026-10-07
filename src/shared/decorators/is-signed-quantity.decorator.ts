import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import regularExpressions from '../regular-expressions.js';
import { CanonicalQuantity } from '../transforms/canonical-quantity.transform.js';

export const IsSignedQuantity =
  (): PropertyDecorator => (target, propertyKey) => {
    ApiProperty({
      type: String,
      format: 'decimal',
      pattern: regularExpressions.signedQuantity.source,
      example: '-1.000',
      description: 'Signed quantity with up to 3 decimal places.',
    })(target, propertyKey);
    CanonicalQuantity()(target, propertyKey);
    Matches(regularExpressions.signedQuantity, {
      message: `${String(propertyKey)} must be a signed quantity with at most 3 decimal places`,
    })(target, propertyKey);
  };
