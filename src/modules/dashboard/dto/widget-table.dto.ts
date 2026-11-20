import { ApiProperty } from '@nestjs/swagger';
import { WidgetTableColumnDto } from './widget-table-column.dto.js';
import { WidgetTableRowDto } from './widget-table-row.dto.js';

export class WidgetTableDto {
  @ApiProperty({
    type: String,
    description: 'Row dimension, e.g. "trafficSource"',
  })
  dimension: string;

  @ApiProperty({ type: () => WidgetTableColumnDto, isArray: true })
  columns: WidgetTableColumnDto[];

  @ApiProperty({ type: () => WidgetTableRowDto, isArray: true })
  rows: WidgetTableRowDto[];

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'number', nullable: true },
    description: 'Value per column key over all rows',
  })
  totals: Record<string, number | null>;
}
