import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  ValidateBy,
} from 'class-validator';
import regularExpressions from '../../../shared/regular-expressions.js';
import {
  normalizeMapWidgetUrl,
  trimContact,
} from '../rules/location-contacts.js';

export const OptionalLocationPhone = () =>
  applyDecorators(
    ApiProperty({
      type: String,
      required: false,
      nullable: true,
      maxLength: 32,
      example: '+375292332000',
      description: 'E.164 phone for BY, RU or KZ. Blank becomes null.',
    }),
    Transform(({ value }) => trimContact(value)),
    IsOptional(),
    IsString(),
    MaxLength(32),
    Matches(regularExpressions.locationPhone, {
      message: 'phone must be an E.164 number for BY, RU or KZ',
    }),
  );

export const OptionalContact = () =>
  applyDecorators(
    ApiProperty({
      type: String,
      required: false,
      nullable: true,
      maxLength: 255,
      description:
        'URL, @handle or short name; trimmed, blank becomes null. Only http/https schemes are allowed.',
    }),
    Transform(({ value }) => trimContact(value)),
    IsOptional(),
    IsString(),
    MaxLength(255),
    Matches(regularExpressions.contactScheme, {
      message: '$property only allows http and https URL schemes',
    }),
  );

export const OptionalMapWidgetUrl = () =>
  applyDecorators(
    ApiProperty({
      type: String,
      required: false,
      nullable: true,
      maxLength: 2048,
      example:
        'https://yandex.ru/map-widget/v1/?um=constructor%3Aexample&source=constructor',
      description:
        'HTTPS URL containing /map-widget/ in its path, or an iframe embed whose src is extracted. Blank becomes null.',
    }),
    Transform(({ value }) => normalizeMapWidgetUrl(value)),
    IsOptional(),
    IsString(),
    MaxLength(2048),
    IsUrl({ protocols: ['https'], require_protocol: true }),
    ValidateBy({
      name: 'mapWidgetPath',
      validator: {
        validate: (value: unknown) => {
          if (typeof value !== 'string') return false;
          try {
            return new URL(value).pathname.includes('/map-widget/');
          } catch {
            return false;
          }
        },
        defaultMessage: () =>
          'mapWidgetUrl must contain /map-widget/ in its path',
      },
    }),
  );
