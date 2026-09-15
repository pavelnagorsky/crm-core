import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsDateString, Matches, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { IsDateRangeValid } from '../decorators/is-date-range-valid.decorator.js';
import { ShiftsWithinRange } from '../decorators/shifts-within-range.decorator.js';
import { NoShiftDuplicates } from '../decorators/no-shift-duplicates.decorator.js';
import { ShiftTimesValid } from '../decorators/shift-times-valid.decorator.js';
import regularExpressions from '../../../shared/regular-expressions.js';


export class ShiftInputDto {
  @ApiProperty({ type: String, example: '2026-10-01' })
  @IsDateString()
  date: string;

  @ApiProperty({ type: String, example: '09:00' })
  @Matches(regularExpressions.time, { message: 'startTime must be in HH:mm format' })
  startTime: string;

  @ApiProperty({ type: String, example: '18:00' })
  @Matches(regularExpressions.time, { message: 'endTime must be in HH:mm format' })
  endTime: string;
}

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
