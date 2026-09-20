import { ApiProperty } from '@nestjs/swagger';
import { WidgetPeriodDto } from './widget-period.dto.js';

export class WidgetMetaDto {
  @ApiProperty({ type: () => WidgetPeriodDto })
  period: WidgetPeriodDto;

  @ApiProperty({ type: () => WidgetPeriodDto, required: false })
  previousPeriod?: WidgetPeriodDto;

  @ApiProperty({ type: String, required: false })
  currency?: string;
}
