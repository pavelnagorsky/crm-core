import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Matches } from 'class-validator';
import regularExpressions from '../../../shared/regular-expressions.js';

export function IsHexColor(): PropertyDecorator {
  return (target, propertyKey) => {
    ApiProperty({ type: String, example: '#141210' })(target, propertyKey!);
    Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))(target, propertyKey!);
    IsString()(target, propertyKey!);
    Matches(regularExpressions.hexColor, { message: 'color must be a #RRGGBB hex value' })(target, propertyKey!);
  };
}
