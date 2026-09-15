import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsDateString, IsOptional, IsUUID } from 'class-validator';

export class GetCalendarRequestDto {
  @ApiProperty({ type: String, example: '2026-10-01', description: 'Start date (inclusive) YYYY-MM-DD' })
  @IsDateString()
  from: string;

  @ApiProperty({ type: String, example: '2026-10-31', description: 'End date (inclusive) YYYY-MM-DD' })
  @IsDateString()
  to: string;

  @ApiProperty({
    type: [String],
    required: false,
    description: 'Filter events by staff member UUIDs. Business-level events (staffId=null) are always included.',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  staffIds?: string[];
}
