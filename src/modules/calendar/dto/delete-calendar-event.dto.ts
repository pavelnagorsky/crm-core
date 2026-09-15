import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsDateString, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';

export class DeleteCalendarEventDto {
  @ApiProperty({ type: Boolean, description: 'true cancels only this occurrence; false deletes the entire event' })
  @IsBoolean()
  @Type(() => Boolean)
  thisOnly: boolean;

  @ApiProperty({ type: String, required: false, nullable: true, description: 'Required when thisOnly is true — the specific occurrence date YYYY-MM-DD' })
  @ValidateIf((o) => o.thisOnly === true)
  @IsDateString()
  occurrenceDate?: string;
}
