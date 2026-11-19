import { ApiProperty } from '@nestjs/swagger';
import { ClosedTimeItemDto } from './closed-time-item.dto.js';

/** Time inside the view bounds when one staff member is not working. */
export class StaffClosedTimeItemDto extends ClosedTimeItemDto {
  @ApiProperty({ type: String, format: 'uuid' })
  staffId: string;
}
