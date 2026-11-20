import { ApiProperty } from '@nestjs/swagger';
import { MetricUnit } from '../enums/metric-unit.enum.js';

export class WidgetTableColumnDto {
  @ApiProperty({
    type: String,
    description: 'Key of the value in each row `values` and in `totals`',
  })
  key: string;

  @ApiProperty({
    enum: MetricUnit,
    description: 'How to format the column; currency is `meta.currency`',
  })
  unit: MetricUnit;
}
