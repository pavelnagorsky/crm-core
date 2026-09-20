import { ApiProperty } from '@nestjs/swagger';
import { MetricGrowth } from '../enums/metric-growth.enum.js';
import { MetricUnit } from '../enums/metric-unit.enum.js';

export class WidgetMetricDto {
  @ApiProperty({ type: Number })
  value: number;

  @ApiProperty({ enum: MetricUnit, required: false })
  unit?: MetricUnit;

  @ApiProperty({ type: Number, required: false, nullable: true })
  previousValue?: number | null;

  @ApiProperty({ type: Number, required: false, nullable: true })
  deltaAbs?: number | null;

  @ApiProperty({ type: Number, required: false, nullable: true, description: 'Percent change vs previous period; null when previousValue is 0' })
  deltaPct?: number | null;

  @ApiProperty({ enum: MetricGrowth, required: false })
  growth?: MetricGrowth;

  @ApiProperty({ type: Boolean, required: false, description: 'Semantic hint for the frontend: whether growth up is favourable' })
  higherIsBetter?: boolean;

  @ApiProperty({ type: [Number], required: false, description: 'Small ordered series for the sparkline on the card' })
  spark?: number[];
}
