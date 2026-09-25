import { IsOptional, Matches } from 'class-validator';
import regularExpressions from '../regular-expressions.js';
import { CanonicalAmount } from '../transforms/canonical-amount.transform.js';
import { ApiPrice } from './api-decimal.decorator.js';

const priceMatchMessage = (key: string | symbol) =>
  `${String(key)} must be a non-negative amount with at most 2 decimal places`;

export const IsPrice = (): PropertyDecorator => (target, propertyKey) => {
  ApiPrice()(target, propertyKey);
  CanonicalAmount()(target, propertyKey);
  Matches(regularExpressions.moneyAmount, {
    message: priceMatchMessage(propertyKey),
  })(target, propertyKey);
};

export const IsOptionalPrice =
  (): PropertyDecorator => (target, propertyKey) => {
    ApiPrice({ required: false, nullable: true })(target, propertyKey);
    IsOptional()(target, propertyKey);
    CanonicalAmount()(target, propertyKey);
    Matches(regularExpressions.moneyAmount, {
      message: priceMatchMessage(propertyKey),
    })(target, propertyKey);
  };
