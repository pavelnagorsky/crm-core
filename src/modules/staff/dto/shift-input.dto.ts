import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, Matches } from 'class-validator';
import regularExpressions from '../../../shared/regular-expressions.js';

export class ShiftInputDto {
  @ApiProperty({ type: String, example: '2026-10-01' })
  @IsDateString()
  date: string;

  @ApiProperty({ type: String, example: '09:00' })
  @Matches(regularExpressions.time, {
    message: 'startTime must be in HH:mm format',
  })
  startTime: string;

  @ApiProperty({ type: String, example: '18:00' })
  @Matches(regularExpressions.time, {
    message: 'endTime must be in HH:mm format',
  })
  endTime: string;
}
