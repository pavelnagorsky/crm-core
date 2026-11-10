import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { sanitizeReviewText } from '../rules/review-text.rules.js';

export const ReviewText = (maxLength: number, description: string) =>
  applyDecorators(
    ApiProperty({ type: String, minLength: 1, maxLength, description }),
    Transform(({ value }) => sanitizeReviewText(value)),
    IsString(),
    IsNotEmpty(),
    MaxLength(maxLength),
  );
