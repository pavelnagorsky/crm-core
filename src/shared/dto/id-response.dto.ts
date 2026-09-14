import { ApiProperty } from '@nestjs/swagger';

export class IdResponseDto {
  @ApiProperty({ type: String })
  id: string;
}
