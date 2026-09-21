import { ApiProperty } from '@nestjs/swagger';
import { MetricUnit } from '../../../dashboard/enums/metric-unit.enum.js';
import { StaffWidgetKey } from '../enums/staff-widget-key.enum.js';

/**
 * A single point-in-time KPI card for the staff management page. Unlike dashboard widgets
 * these are not tied to a date range or previous-period comparison, so they carry a plain
 * value plus an optional denominator/secondary signal instead of period metadata.
 */
export class StaffKpiCardDto {
  @ApiProperty({ enum: StaffWidgetKey })
  key: StaffWidgetKey;

  @ApiProperty({
    enum: MetricUnit,
    description: 'Unit of `value`: COUNT for absolute counts, PERCENT for ratios',
  })
  unit: MetricUnit;

  @ApiProperty({
    type: Number,
    description: 'Primary metric: a count, or a 0-100 percentage when unit is PERCENT',
  })
  value: number;

  @ApiProperty({
    type: Number,
    required: false,
    nullable: true,
    description: 'Numerator behind a percentage (e.g. staff with shifts). Null for pure counts.',
  })
  numerator?: number | null;

  @ApiProperty({
    type: Number,
    required: false,
    nullable: true,
    description: 'Denominator behind a percentage (e.g. total active staff). Null for pure counts.',
  })
  denominator?: number | null;

  @ApiProperty({
    type: Number,
    required: false,
    nullable: true,
    description: 'Supporting count shown as a secondary line (e.g. staff deactivated in the last 30 days).',
  })
  secondaryValue?: number | null;

  constructor(partial: Partial<StaffKpiCardDto>) {
    Object.assign(this, partial);
  }
}
