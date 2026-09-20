import { ApiProperty } from '@nestjs/swagger';

export class WidgetSeriesPointDto {
  @ApiProperty({ type: String, description: 'ISO-8601 timestamp of the bucket start' })
  t: string;

  @ApiProperty({ type: 'object', additionalProperties: { type: 'number' } })
  values: Record<string, number>;
}
