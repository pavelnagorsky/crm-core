import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, ValidateBy } from 'class-validator';
import { isPhoneSearchable } from '../phone/phone-search-patterns.js';
import { DigitsOnly } from '../transforms/digits-only.transform.js';

/**
 * An optional typed phone fragment, reduced to digits. Needs 3 digits besides a trunk or
 * international prefix, so "802" or "007" cannot match almost every client. Blank is absent.
 */
export const IsPhoneSearch = (): PropertyDecorator => (target, propertyKey) => {
  ApiProperty({
    type: String,
    required: false,
    example: '8029233',
    description:
      'Phone only, compared by digits: spaces, brackets, dashes and + are ignored; blank means not sent. Matched anywhere in the number. Trunk prefixes: 80 and a single leading 0 also find +375 (Belarus), another leading 8 finds +7 (Russia), 00 is international. Needs at least 3 digits besides such a prefix and at most 20 digits, otherwise 400. Numbers that start with the typed digits (with or without the +375 / +7 country code) come first, then the rest.',
  })(target, propertyKey);
  DigitsOnly()(target, propertyKey);
  IsOptional()(target, propertyKey);
  ValidateBy({
    name: 'isPhoneSearch',
    validator: {
      validate: (value: unknown) =>
        typeof value === 'string' && isPhoneSearchable(value),
      defaultMessage: () =>
        '$property must contain at least 3 digits besides a trunk prefix (80, 8, 0, 00) and at most 20 digits',
    },
  })(target, propertyKey);
};
