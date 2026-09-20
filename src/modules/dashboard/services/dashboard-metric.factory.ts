import { Injectable } from '@nestjs/common';
import { WidgetMetricDto } from '../dto/widget-metric.dto.js';
import { MetricGrowth } from '../enums/metric-growth.enum.js';
import { MetricUnit } from '../enums/metric-unit.enum.js';

const GROWTH_EPSILON_PCT = 0.5;

export interface MetricInput {
  value: number;
  previousValue?: number;
  unit: MetricUnit;
  higherIsBetter: boolean;
  spark?: number[];
}

@Injectable()
export class DashboardMetricFactory {
  build(input: MetricInput): WidgetMetricDto {
    const metric: WidgetMetricDto = {
      value: this.round(input.value, input.unit),
      unit: input.unit,
      higherIsBetter: input.higherIsBetter,
    };
    if (input.spark) metric.spark = input.spark;
    if (input.previousValue === undefined) return metric;

    const prev = input.previousValue;
    metric.previousValue = this.round(prev, input.unit);
    metric.deltaAbs = this.round(input.value - prev, input.unit);
    metric.deltaPct = prev === 0 ? null : +(((input.value - prev) / prev) * 100).toFixed(1);
    metric.growth = this.growth(metric.deltaAbs, metric.deltaPct);
    return metric;
  }

  private growth(deltaAbs: number, deltaPct: number | null): MetricGrowth {
    if (deltaAbs === 0) return MetricGrowth.SAME;
    if (deltaPct !== null && Math.abs(deltaPct) < GROWTH_EPSILON_PCT) return MetricGrowth.SAME;
    return deltaAbs > 0 ? MetricGrowth.UP : MetricGrowth.DOWN;
  }

  private round(v: number, unit: MetricUnit): number {
    if (unit === MetricUnit.PERCENT) return +v.toFixed(1);
    if (unit === MetricUnit.CURRENCY) return +v.toFixed(2);
    return Math.round(v);
  }
}
