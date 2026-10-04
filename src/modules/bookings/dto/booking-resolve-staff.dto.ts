import { ApiProperty } from '@nestjs/swagger';

export class BookingResolveStaffDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  name: string;
}
