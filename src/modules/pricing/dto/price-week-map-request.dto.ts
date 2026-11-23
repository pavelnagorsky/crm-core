import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { IsCalendarDate } from '../../../shared/time/decorators/is-calendar-date.validator.js';

export class PriceWeekMapRequestDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  serviceId: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    required: false,
    description:
      'Price of this staff member. At most one of staffId and levelId; neither: the base level.',
  })
  @IsOptional()
  @IsUUID()
  staffId?: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    required: false,
    description: 'Price of a staff member of this level, without personal prices.',
  })
  @IsOptional()
  @IsUUID()
  levelId?: string;

  @ApiProperty({
    type: String,
    example: '2026-12-01',
    description: 'First day of the 7 days shown (local date).',
  })
  @IsCalendarDate()
  weekStart: string;
}
