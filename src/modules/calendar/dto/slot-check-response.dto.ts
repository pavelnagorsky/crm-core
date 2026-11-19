import { ApiProperty } from '@nestjs/swagger';
import { SlotConflictReason } from '../enums/slot-conflict-reason.enum.js';
import { SlotCheckResult } from '../interfaces/slot-check-result.interface.js';

export class SlotCheckResponseDto {
  @ApiProperty({
    type: Boolean,
    description:
      'Whether the visit fits: every service has a free qualified staff member (distinct ones for a parallel bundle)',
  })
  available: boolean;

  @ApiProperty({
    enum: SlotConflictReason,
    enumName: 'SlotConflictReason',
    nullable: true,
    description:
      'Null when available. BOOKING / BLOCK / NO_SHIFT / OUTSIDE_SCHEDULE: the first obstacle of the one staff member who could take the first service nobody can take. NO_STAFF: several staff members could take that service and none is free, nobody performs it, or every service has a free staff member but no team of distinct staff can be formed (parallel bundle)',
  })
  reason: SlotConflictReason | null;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Staff member the obstacle belongs to; null for NO_STAFF',
  })
  staffId: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '2026-11-20T15:30:00',
    description:
      'Obstacle start, local wall time in the location timezone. BOOKING / BLOCK: the occupying event, clipped to the visit day. NO_SHIFT: the whole visit. OUTSIDE_SCHEDULE: the part of the visit outside the shift. Null when available or for NO_STAFF',
  })
  conflictStart: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '2026-11-20T17:00:00',
    description:
      'Obstacle end, local wall time in the location timezone; midnight is the next day T00:00:00',
  })
  conflictEnd: string | null;

  @ApiProperty({
    type: String,
    example: '2026-11-20T14:00:00',
    description: 'Visit start as requested, local wall time',
  })
  startAt: string;

  @ApiProperty({
    type: String,
    example: '2026-11-20T16:00:00',
    description:
      'Visit end from catalog durations and buffers (one booking step without services), local wall time',
  })
  endAt: string;

  static fromResult(result: SlotCheckResult): SlotCheckResponseDto {
    return Object.assign(new SlotCheckResponseDto(), result);
  }
}
