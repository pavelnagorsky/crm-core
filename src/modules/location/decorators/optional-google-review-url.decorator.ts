import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, ValidateBy } from 'class-validator';
import { trimContact } from '../rules/location-contacts.js';
import { isGoogleReviewUrl } from '../rules/review-links.js';

export const OptionalGoogleReviewUrl = () =>
  applyDecorators(
    ApiProperty({
      type: String,
      required: false,
      nullable: true,
      maxLength: 2048,
      example: 'https://g.page/r/CexampleId/review',
      description:
        'HTTPS link where a client can leave a Google Maps review: g.page/r/…/review, search.google.com/local/writereview or google.com/maps/place/…. Blank becomes null.',
    }),
    Transform(({ value }) => trimContact(value)),
    IsOptional(),
    IsString(),
    MaxLength(2048),
    ValidateBy({
      name: 'googleReviewUrl',
      validator: {
        validate: isGoogleReviewUrl,
        defaultMessage: () =>
          'googleReviewUrl must be an https Google Maps review link',
      },
    }),
  );
