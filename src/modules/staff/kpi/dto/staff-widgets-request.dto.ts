import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayNotEmpty, ArrayUnique, IsArray, IsEnum } from 'class-validator';
import { StaffFilterDto } from '../../dto/staff-filter.dto.js';
import { StaffWidgetKey } from '../enums/staff-widget-key.enum.js';

export class StaffWidgetsRequestDto extends StaffFilterDto {
  @ApiProperty({ enum: StaffWidgetKey, isArray: true })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @ArrayMaxSize(Object.keys(StaffWidgetKey).length)
  @IsEnum(StaffWidgetKey, { each: true })
  keys: StaffWidgetKey[];
}
