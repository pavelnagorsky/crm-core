import { MetricUnit } from '../enums/metric-unit.enum.js';

export interface MetricInput {
  value: number;
  previousValue?: number;
  unit: MetricUnit;
  higherIsBetter: boolean;
  spark?: number[];
}
