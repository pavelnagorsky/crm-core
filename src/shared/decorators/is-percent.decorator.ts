import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';
import regularExpressions from '../regular-expressions.js';
import { NormalizePrice } from '../transforms/normalize-price.transform.js';

const percentMatchMessage = (key: string | symbol) =>
  `${String(key)} must be a number from 0 to 100`;

export const IsPercent = (): PropertyDecorator =>
  (target, propertyKey) => {
    ApiProperty({ type: String, example: '30.00' })(target, propertyKey);
    NormalizePrice()(target, propertyKey);
    Matches(regularExpressions.percent, { message: percentMatchMessage(propertyKey) })(target, propertyKey);
  };

export const IsOptionalPercent = (): PropertyDecorator =>
  (target, propertyKey) => {
    ApiProperty({ type: String, example: '30.00', required: false, nullable: true })(target, propertyKey);
    IsOptional()(target, propertyKey);
    NormalizePrice()(target, propertyKey);
    Matches(regularExpressions.percent, { message: percentMatchMessage(propertyKey) })(target, propertyKey);
  };
