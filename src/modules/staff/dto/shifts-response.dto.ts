import { ApiProperty } from '@nestjs/swagger';
import { ShiftItemDto } from './shift-item.dto.js';

export class ShiftsResponseDto {
  @ApiProperty({ type: String, example: '2026-10-01' })
  from: string;

  @ApiProperty({ type: String, example: '2026-10-31' })
  to: string;

  @ApiProperty({ type: () => ShiftItemDto, isArray: true })
  shifts: ShiftItemDto[];

  constructor(from: string, to: string, shifts: ShiftItemDto[]) {
    this.from = from;
    this.to = to;
    this.shifts = shifts;
  }
}
