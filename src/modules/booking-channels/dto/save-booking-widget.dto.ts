import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsString,
  MaxLength,
  Validate,
  ValidateNested,
} from 'class-validator';
import { BookingWidgetButtonPosition } from '../enums/booking-widget-button-position.enum.js';
import { BookingWidgetPlacement } from '../enums/booking-widget-placement.enum.js';
import { BookingWidgetTrigger } from '../enums/booking-widget-trigger.enum.js';
import { BookingChannelStatus } from '../enums/booking-channel-status.enum.js';
import { BookingWidgetButtonAppearanceDto } from './booking-widget-button-appearance.dto.js';
import { BookingWidgetButtonOffsetConstraint } from '../decorators/booking-widget-button-offset.constraint.js';
import { Trim } from '../decorators/trim.decorator.js';
import { BookingChannelAnalyticsDto } from './booking-channel-analytics.dto.js';
import { BookingFormConfigDto } from './booking-form-config.dto.js';

export class SaveBookingWidgetDto extends BookingChannelAnalyticsDto {
  @ApiProperty({ type: String, minLength: 1, maxLength: 80 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  title: string;

  @ApiProperty({ type: () => BookingFormConfigDto })
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => BookingFormConfigDto)
  form: BookingFormConfigDto;

  @ApiProperty({
    enum: BookingWidgetPlacement,
    enumName: 'BookingWidgetPlacement',
    description:
      'INLINE displays the form immediately with no opening button; trigger is normalized to INLINE_BUTTON.',
  })
  @IsEnum(BookingWidgetPlacement)
  placement: BookingWidgetPlacement;

  @ApiProperty({ enum: BookingWidgetTrigger, enumName: 'BookingWidgetTrigger' })
  @IsEnum(BookingWidgetTrigger)
  trigger: BookingWidgetTrigger;

  @ApiProperty({
    enum: BookingWidgetButtonPosition,
    enumName: 'BookingWidgetButtonPosition',
    description:
      'Applied only to FLOATING_BUTTON. Retained in other scenarios.',
  })
  @IsEnum(BookingWidgetButtonPosition)
  buttonPosition: BookingWidgetButtonPosition;

  @ApiProperty({ enum: BookingChannelStatus, enumName: 'BookingChannelStatus' })
  @IsEnum(BookingChannelStatus)
  status: BookingChannelStatus;

  @ApiProperty({
    type: () => BookingWidgetButtonAppearanceDto,
    description:
      'Saved in full, including settings inactive for the current placement or trigger.',
  })
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Validate(BookingWidgetButtonOffsetConstraint)
  @Type(() => BookingWidgetButtonAppearanceDto)
  buttonAppearance: BookingWidgetButtonAppearanceDto;
}
