import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsEnum, IsUUID } from 'class-validator';
import { StaffWidgetKey } from '../enums/staff-widget-key.enum.js';

export class StaffWidgetsRequestDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @Type(() => String)
  @IsUUID()
  businessId: string;

  @ApiProperty({ enum: StaffWidgetKey, isArray: true })
  @Transform(({ value }) => {
    return Array.isArray(value) ? value : [value];
  })
  @IsArray()
  @IsEnum(StaffWidgetKey, { each: true })
  keys: StaffWidgetKey[];
}
