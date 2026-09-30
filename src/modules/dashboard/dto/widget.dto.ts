import { ApiProperty } from '@nestjs/swagger';
import { WidgetKind } from '../enums/widget-kind.enum.js';
import { WidgetBreakdownDto } from './widget-breakdown.dto.js';
import { WidgetHeatmapDto } from './widget-heatmap.dto.js';
import { WidgetMetaDto } from './widget-meta.dto.js';
import { WidgetMetricDto } from './widget-metric.dto.js';
import { WidgetSeriesDto } from './widget-series.dto.js';

export class WidgetDto {
  @ApiProperty({
    type: String,
    description:
      'Widget key identifying the metric/series/breakdown; taken from the caller-specific enum (e.g. DashboardWidgetKey or ServicesAnalyticsWidgetKey)',
  })
  key: string;

  @ApiProperty({ enum: WidgetKind })
  kind: WidgetKind;

  @ApiProperty({
    type: () => WidgetMetricDto,
    required: false,
    description:
      'Headline value. Set on metric widgets, and also on chart widgets that show a single number beside the series or breakdown.',
  })
  metric?: WidgetMetricDto;

  @ApiProperty({ type: () => WidgetSeriesDto, required: false })
  series?: WidgetSeriesDto;

  @ApiProperty({ type: () => WidgetBreakdownDto, required: false })
  breakdown?: WidgetBreakdownDto;

  @ApiProperty({ type: () => WidgetHeatmapDto, required: false })
  heatmap?: WidgetHeatmapDto;

  @ApiProperty({ type: () => WidgetMetaDto, required: false })
  meta?: WidgetMetaDto;
}
