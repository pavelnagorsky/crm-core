import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsDateString, ValidateIf } from 'class-validator';
import { ParseBoolean } from '../../../shared/transforms/parse-boolean.transform.js';

export class DeleteCalendarEventDto {
  @ApiProperty({
    type: Boolean,
    description:
      'true cancels only this occurrence; false deletes the entire event',
  })
  @ParseBoolean()
  @IsBoolean()
  thisOnly: boolean;

  @ApiProperty({
    type: String,
    required: false,
    nullable: true,
    description:
      'Required when thisOnly is true — the specific occurrence date YYYY-MM-DD',
  })
  @ValidateIf((o) => o.thisOnly === true)
  @IsDateString()
  occurrenceDate?: string;
}
