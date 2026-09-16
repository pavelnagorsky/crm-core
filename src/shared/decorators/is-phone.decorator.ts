import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import regularExpressions from '../regular-expressions.js';
import { NormalizePhone } from '../transforms/normalize-phone.transform.js';

export const IsPhone = (): PropertyDecorator =>
  (target, propertyKey) => {
    ApiProperty({ type: String, example: '+375292332000' })(target, propertyKey);
    NormalizePhone()(target, propertyKey);
    IsString()(target, propertyKey);
    MaxLength(30)(target, propertyKey);
    Matches(regularExpressions.phone, { message: 'phone must be in E.164 format' })(target, propertyKey);
  };

export const IsOptionalPhone = (): PropertyDecorator =>
  (target, propertyKey) => {
    ApiProperty({ type: String, example: '+375292332000', required: false, nullable: true })(target, propertyKey);
    IsOptional()(target, propertyKey);
    NormalizePhone()(target, propertyKey);
    IsString()(target, propertyKey);
    MaxLength(30)(target, propertyKey);
    Matches(regularExpressions.phone, { message: 'phone must be in E.164 format' })(target, propertyKey);
  };
