import { ApiProperty } from '@nestjs/swagger';
import { WidgetPeriodDto } from './widget-period.dto.js';

export class WidgetMetaDto {
  @ApiProperty({ type: () => WidgetPeriodDto })
  period: WidgetPeriodDto;

  @ApiProperty({ type: () => WidgetPeriodDto, required: false })
  previousPeriod?: WidgetPeriodDto;

  @ApiProperty({
    type: String,
    description:
      'IANA timezone the period and buckets were computed in, e.g. Europe/Minsk',
  })
  timezone: string;

  @ApiProperty({ type: String, required: false })
  currency?: string;
}
