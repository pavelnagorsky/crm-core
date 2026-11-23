import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsUUID, Matches, ValidateIf } from 'class-validator';
import regularExpressions from '../../../shared/regular-expressions.js';
import { IsCalendarDate } from '../../../shared/time/decorators/is-calendar-date.validator.js';

export class PriceExplainRequestDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    required: false,
    description: 'A service; exactly one of serviceId and bundleId.',
  })
  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    required: false,
    description: 'A bundle; exactly one of serviceId and bundleId.',
  })
  @IsOptional()
  @IsUUID()
  bundleId?: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      'Staff member; null: "any staff" is assigned by the location rule.',
  })
  @ValidateIf((dto: PriceExplainRequestDto) => dto.staffId !== null)
  @IsUUID()
  staffId: string | null;

  @ApiProperty({
    type: String,
    example: '2026-12-05',
    description: 'Local date.',
  })
  @IsCalendarDate()
  date: string;

  @ApiProperty({
    type: String,
    example: '18:30',
    description: 'Local visit start.',
  })
  @Matches(regularExpressions.time)
  time: string;
}
