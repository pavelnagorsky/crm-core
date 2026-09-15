import { ApiProperty } from '@nestjs/swagger';

export class ClosedTimeItemDto {
  @ApiProperty({ type: String, description: 'YYYY-MM-DD' })
  date: string;

  @ApiProperty({ type: String, description: 'HH:mm — start of closed block in business timezone' })
  startTime: string;

  @ApiProperty({ type: String, description: 'HH:mm — end of closed block in business timezone' })
  endTime: string;
}
