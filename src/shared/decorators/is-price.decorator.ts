import { IsOptional, Matches, ValidateIf } from 'class-validator';
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

/** A price greater than zero, such as a refund amount. */
export const IsPositivePrice =
  (description?: string): PropertyDecorator =>
  (target, propertyKey) => {
    ApiPrice({
      description:
        description ?? 'Positive monetary amount with 2 fractional digits.',
    })(target, propertyKey);
    CanonicalAmount()(target, propertyKey);
    Matches(regularExpressions.positiveMoneyAmount, {
      message: `${String(propertyKey)} must be a positive amount with at most 2 decimal places`,
    })(target, propertyKey);
  };

export const IsOptionalPrice =
  (description?: string): PropertyDecorator =>
  (target, propertyKey) => {
    ApiPrice({ required: false, nullable: true, description })(
      target,
      propertyKey,
    );
    IsOptional()(target, propertyKey);
    CanonicalAmount()(target, propertyKey);
    Matches(regularExpressions.moneyAmount, {
      message: priceMatchMessage(propertyKey),
    })(target, propertyKey);
  };

export const IsNullablePrice =
  (): PropertyDecorator => (target, propertyKey) => {
    ApiPrice({ required: true, nullable: true })(target, propertyKey);
    ValidateIf((_, value) => value !== null)(target, propertyKey);
    CanonicalAmount()(target, propertyKey);
    Matches(regularExpressions.moneyAmount, {
      message: priceMatchMessage(propertyKey),
    })(target, propertyKey);
  };
