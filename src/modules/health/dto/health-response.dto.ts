import { ApiProperty } from '@nestjs/swagger';

export class HealthResponseDto {
  @ApiProperty({ type: String, example: 'ok' })
  status: string;

  @ApiProperty({ type: String, example: '2026-09-17T10:00:00.000Z' })
  timestamp: string;
}
