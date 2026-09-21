import { ApiProperty } from '@nestjs/swagger';
import { StaffShift } from '@prisma/client';

export class ShiftItemDto {
  @ApiProperty({
    type: String,
    example: '2026-10-01',
    description: 'Date in YYYY-MM-DD format',
  })
  date: string;

  @ApiProperty({
    type: String,
    example: '09:00',
    description: 'Start time HH:mm in business timezone',
  })
  startTime: string;

  @ApiProperty({
    type: String,
    example: '18:00',
    description: 'End time HH:mm in business timezone',
  })
  endTime: string;

  static fromEntity(shift: StaffShift): ShiftItemDto {
    const dto = new ShiftItemDto();
    dto.date = shift.date.toISOString().slice(0, 10);
    dto.startTime = formatTime(shift.startTime);
    dto.endTime = formatTime(shift.endTime);
    return dto;
  }
}

function formatTime(dt: Date): string {
  const h = dt.getUTCHours().toString().padStart(2, '0');
  const m = dt.getUTCMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}
