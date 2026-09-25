import {
  ApiProperty,
  getSchemaPath,
  type OpenAPIObject,
  type SchemaObject,
} from '@nestjs/swagger';
import regularExpressions from '../regular-expressions.js';

const PRICE = 'Price';
const SIGNED_AMOUNT = 'SignedAmount';
const PERCENT = 'Percent';
const DECIMAL = 'Decimal';

const priceDescription =
  'Non-negative monetary amount. Decimal string with 2 fractional digits; a shorter fraction is normalized (49.9 becomes 49.90).';
const signedAmountDescription =
  'Signed monetary amount. Decimal string with 2 fractional digits; a shorter fraction is normalized.';
const percentDescription =
  'Percent from 0 to 100. Decimal string with up to 2 fractional digits.';
const decimalDescription = 'Non-negative decimal with 2 fractional digits.';

const decimalSchemas: Record<string, SchemaObject> = {
  [PRICE]: {
    type: 'string',
    format: 'decimal',
    pattern: regularExpressions.moneyAmount.source,
    example: '49.99',
    description: priceDescription,
  },
  [SIGNED_AMOUNT]: {
    type: 'string',
    format: 'decimal',
    pattern: regularExpressions.signedAmount.source,
    example: '-150.00',
    description: signedAmountDescription,
  },
  [PERCENT]: {
    type: 'string',
    format: 'decimal',
    pattern: regularExpressions.percent.source,
    example: '30.00',
    description: percentDescription,
  },
  [DECIMAL]: {
    type: 'string',
    format: 'decimal',
    pattern: regularExpressions.moneyAmount.source,
    example: '1.00',
    description: decimalDescription,
  },
};

type DecimalPropertyOptions = {
  nullable?: boolean;
  required?: boolean;
  description?: string;
  example?: string;
};

const decimalProperty = (
  schemaName: string,
  description: string,
  example: string,
  options: DecimalPropertyOptions = {},
): PropertyDecorator =>
  ApiProperty({
    type: String,
    description: options.description ?? description,
    example: options.example ?? example,
    nullable: options.nullable ? true : undefined,
    required: options.required,
    allOf: [{ $ref: getSchemaPath(schemaName) }],
  });

export const ApiPrice = (options?: DecimalPropertyOptions): PropertyDecorator =>
  decimalProperty(PRICE, priceDescription, '49.99', options);

export const ApiSignedAmount = (
  options?: DecimalPropertyOptions,
): PropertyDecorator =>
  decimalProperty(SIGNED_AMOUNT, signedAmountDescription, '-150.00', options);

export const ApiPercent = (
  options?: DecimalPropertyOptions,
): PropertyDecorator =>
  decimalProperty(PERCENT, percentDescription, '30.00', options);

export const ApiDecimal = (
  options?: DecimalPropertyOptions,
): PropertyDecorator =>
  decimalProperty(DECIMAL, decimalDescription, '1.00', options);

export const registerDecimalSchemas = (document: OpenAPIObject): void => {
  document.components ??= {};
  document.components.schemas ??= {};
  Object.assign(document.components.schemas, decimalSchemas);
};
