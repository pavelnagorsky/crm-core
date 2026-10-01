import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsISO8601, ValidateIf } from 'class-validator';
import { ParseBoolean } from '../../../shared/transforms/parse-boolean.transform.js';

export class MoveCalendarEventDto {
  @ApiProperty({ type: String, description: 'Local business time without an offset', example: '2026-10-01T10:00:00' })
  @IsISO8601()
  startDateTime: string;

  @ApiProperty({ type: String, description: 'Local business time without an offset', example: '2026-10-01T11:00:00' })
  @IsISO8601()
  endDateTime: string;

  @ApiProperty({ type: Boolean, description: 'true moves only this occurrence; false moves the whole series' })
  @ParseBoolean()
  @IsBoolean()
  thisOnly: boolean;

  @ApiProperty({ type: String, required: false, nullable: true, description: 'Required when thisOnly is true — the occurrence date YYYY-MM-DD' })
  @ValidateIf((o) => o.thisOnly === true)
  @IsDateString()
  occurrenceDate?: string | null;
}
