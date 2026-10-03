import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEnum, IsNotEmpty, IsString, MaxLength, Validate, ValidateNested } from 'class-validator';
import { BookingWidgetButtonPosition } from '../enums/booking-widget-button-position.enum.js';
import { BookingWidgetPlacement } from '../enums/booking-widget-placement.enum.js';
import { BookingWidgetTrigger } from '../enums/booking-widget-trigger.enum.js';
import { AllowedDomainsConstraint } from '../decorators/allowed-domains.constraint.js';
import { Trim } from '../decorators/trim.decorator.js';
import { BookingFormConfigDto } from './booking-form-config.dto.js';

export class SaveBookingWidgetDto {
  @ApiProperty({ type: String, maxLength: 80 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  title: string;

  @ApiProperty({ type: () => BookingFormConfigDto })
  @ValidateNested()
  @Type(() => BookingFormConfigDto)
  form: BookingFormConfigDto;

  @ApiProperty({ enum: BookingWidgetPlacement, enumName: 'BookingWidgetPlacement' })
  @IsEnum(BookingWidgetPlacement)
  placement: BookingWidgetPlacement;

  @ApiProperty({ enum: BookingWidgetTrigger, enumName: 'BookingWidgetTrigger' })
  @IsEnum(BookingWidgetTrigger)
  trigger: BookingWidgetTrigger;

  @ApiProperty({ enum: BookingWidgetButtonPosition, enumName: 'BookingWidgetButtonPosition' })
  @IsEnum(BookingWidgetButtonPosition)
  buttonPosition: BookingWidgetButtonPosition;

  @ApiProperty({ type: [String], description: 'Hostnames. Empty means any site. Protocol, path, port and a leading www. are stripped.' })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Validate(AllowedDomainsConstraint)
  allowedDomains: string[];
}
