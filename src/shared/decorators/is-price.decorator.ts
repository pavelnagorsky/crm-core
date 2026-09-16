import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';
import regularExpressions from '../regular-expressions.js';
import { NormalizePrice } from '../transforms/normalize-price.transform.js';

const priceMatchMessage = (key: string | symbol) =>
  `${String(key)} must be a positive number`;

export const IsPrice = (): PropertyDecorator =>
  (target, propertyKey) => {
    ApiProperty({ type: String, example: '49.99' })(target, propertyKey);
    NormalizePrice()(target, propertyKey);
    Matches(regularExpressions.positiveDecimal, { message: priceMatchMessage(propertyKey) })(target, propertyKey);
  };

export const IsOptionalPrice = (): PropertyDecorator =>
  (target, propertyKey) => {
    ApiProperty({ type: String, example: '49.99', required: false, nullable: true })(target, propertyKey);
    IsOptional()(target, propertyKey);
    NormalizePrice()(target, propertyKey);
    Matches(regularExpressions.positiveDecimal, { message: priceMatchMessage(propertyKey) })(target, propertyKey);
  };
