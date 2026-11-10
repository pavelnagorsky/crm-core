import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, ValidateBy } from 'class-validator';
import { trimContact } from '../rules/location-contacts.js';
import { isYandexReviewUrl } from '../rules/review-links.js';

export const OptionalYandexReviewUrl = () =>
  applyDecorators(
    ApiProperty({
      type: String,
      required: false,
      nullable: true,
      maxLength: 2048,
      example: 'https://yandex.ru/maps/org/example/1234567890/reviews/',
      description:
        'HTTPS link to the Yandex Maps organization page or profile where a client can leave a review: yandex.ru/maps/org/…, yandex.ru/profile/<id> (also .by, .kz, .uz, .com). Blank becomes null.',
    }),
    Transform(({ value }) => trimContact(value)),
    IsOptional(),
    IsString(),
    MaxLength(2048),
    ValidateBy({
      name: 'yandexReviewUrl',
      validator: {
        validate: isYandexReviewUrl,
        defaultMessage: () =>
          'yandexReviewUrl must be an https Yandex Maps review link',
      },
    }),
  );
