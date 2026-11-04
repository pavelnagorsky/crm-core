import { ApiProperty } from '@nestjs/swagger';
import { plainToInstance, Transform } from 'class-transformer';
import type { Prisma } from '@prisma/client';
import { DEFAULT_BOOKING_WIDGET_BUTTON_APPEARANCE } from '../constants/booking-widget-button.constants.js';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { IsHexColor } from '../decorators/is-hex-color.decorator.js';
import { Trim } from '../decorators/trim.decorator.js';
import { BookingWidgetButtonVariant } from '../enums/booking-widget-button-variant.enum.js';
import { BookingWidgetButtonFormat } from '../enums/booking-widget-button-format.enum.js';
import { BookingWidgetButtonSize } from '../enums/booking-widget-button-size.enum.js';
import { BookingWidgetButtonRadius } from '../enums/booking-widget-button-radius.enum.js';
import { BookingWidgetButtonIcon } from '../enums/booking-widget-button-icon.enum.js';

export class BookingWidgetButtonAppearanceDto {
  @ApiProperty({
    type: String,
    minLength: 1,
    maxLength: 40,
    example: 'Записаться',
    description: 'Accessible label even when format is ICON.',
  })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  text: string;

  @ApiProperty({
    enum: BookingWidgetButtonVariant,
    enumName: 'BookingWidgetButtonVariant',
  })
  @IsEnum(BookingWidgetButtonVariant)
  variant: BookingWidgetButtonVariant;

  @ApiProperty({
    enum: BookingWidgetButtonFormat,
    enumName: 'BookingWidgetButtonFormat',
  })
  @IsEnum(BookingWidgetButtonFormat)
  format: BookingWidgetButtonFormat;

  @ApiProperty({
    enum: BookingWidgetButtonSize,
    enumName: 'BookingWidgetButtonSize',
  })
  @IsEnum(BookingWidgetButtonSize)
  size: BookingWidgetButtonSize;

  @ApiProperty({
    enum: BookingWidgetButtonRadius,
    enumName: 'BookingWidgetButtonRadius',
  })
  @IsEnum(BookingWidgetButtonRadius)
  radius: BookingWidgetButtonRadius;

  @ApiProperty({
    enum: BookingWidgetButtonIcon,
    enumName: 'BookingWidgetButtonIcon',
  })
  @Transform(({ value }) =>
    value === 'NONE' ? BookingWidgetButtonIcon.CALENDAR : value,
  )
  @IsEnum(BookingWidgetButtonIcon)
  icon: BookingWidgetButtonIcon;

  @IsHexColor()
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Null uses form accent color.',
  })
  @ValidateIf((_dto, value) => value !== null)
  color: string | null;

  @IsHexColor()
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Explicit color overrides automatic text and icon color. Null: contrasting black/white for SOLID, accent for OUTLINE and SOFT.',
  })
  @ValidateIf((_dto, value) => value !== null)
  textColor: string | null;

  @ApiProperty({ type: Boolean })
  @IsBoolean()
  shadow: boolean;

  @ApiProperty({
    type: Boolean,
    description: 'Applies to INLINE_BUTTON with TEXT or ICON_TEXT only.',
  })
  @IsBoolean()
  fullWidth: boolean;

  @ApiProperty({
    type: Boolean,
    description:
      'Applies to FLOATING_BUTTON only, including when desktop format is TEXT.',
  })
  @IsBoolean()
  mobileIconOnly: boolean;

  @ApiProperty({
    type: Number,
    minimum: 8,
    maximum: 64,
    example: 24,
    description:
      'Range 8-64 is validated only for an active floating button. Retained in other scenarios.',
  })
  @IsInt()
  offset: number;

  static fromStored(
    value: Prisma.JsonValue | undefined,
  ): BookingWidgetButtonAppearanceDto {
    return plainToInstance(BookingWidgetButtonAppearanceDto, {
      ...DEFAULT_BOOKING_WIDGET_BUTTON_APPEARANCE,
      ...(value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : {}),
    });
  }
}
