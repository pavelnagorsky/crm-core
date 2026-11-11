import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class ReviewSummaryRequestDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    required: false,
    description: 'Summary of one staff member instead of the whole location',
  })
  @IsOptional()
  @IsUUID()
  staffId?: string;
}
