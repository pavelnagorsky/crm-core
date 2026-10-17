import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsDateString, ValidateNested } from 'class-validator';
import { IsDateRangeValid } from '../decorators/is-date-range-valid.decorator.js';
import { NoShiftDuplicates } from '../decorators/no-shift-duplicates.decorator.js';
import { ShiftTimesValid } from '../decorators/shift-times-valid.decorator.js';
import { ShiftsWithinRange } from '../decorators/shifts-within-range.decorator.js';
import { ShiftInputDto } from './shift-input.dto.js';

@IsDateRangeValid()
@ShiftsWithinRange()
@NoShiftDuplicates()
@ShiftTimesValid()
export class ReplaceShiftsRequestDto {
  @ApiProperty({ type: String, example: '2026-10-01' })
  @IsDateString()
  from: string;

  @ApiProperty({ type: String, example: '2026-10-31' })
  @IsDateString()
  to: string;

  @ApiProperty({ type: () => ShiftInputDto, isArray: true })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ShiftInputDto)
  shifts: ShiftInputDto[];
}
