import { ApiProperty } from '@nestjs/swagger';
import { WidgetBreakdownItemDto } from './widget-breakdown-item.dto.js';

export class WidgetBreakdownDto {
  @ApiProperty({ type: String, description: 'Dimension name, e.g. "source" | "service" | "staff" | "weekday"' })
  dimension: string;

  @ApiProperty({ type: () => WidgetBreakdownItemDto, isArray: true })
  items: WidgetBreakdownItemDto[];

  @ApiProperty({ type: Number, required: false })
  total?: number;
}
