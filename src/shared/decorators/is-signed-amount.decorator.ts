import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import regularExpressions from '../regular-expressions.js';
import { NormalizeSignedAmount } from '../transforms/normalize-signed-amount.transform.js';

const amountMatchMessage = (key: string | symbol) =>
  `${String(key)} must be a number`;

export const IsSignedAmount = (): PropertyDecorator =>
  (target, propertyKey) => {
    ApiProperty({ type: String, example: '-150.00' })(target, propertyKey);
    NormalizeSignedAmount()(target, propertyKey);
    Matches(regularExpressions.signedDecimal, { message: amountMatchMessage(propertyKey) })(target, propertyKey);
  };
