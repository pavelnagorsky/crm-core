import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsEnum } from 'class-validator';
import { StaffWidgetKey } from '../enums/staff-widget-key.enum.js';

export class StaffWidgetsRequestDto {
  @ApiProperty({ enum: StaffWidgetKey, isArray: true })
  @Transform(({ value }) => {
    return Array.isArray(value) ? value : [value];
  })
  @IsArray()
  @IsEnum(StaffWidgetKey, { each: true })
  keys: StaffWidgetKey[];
}
