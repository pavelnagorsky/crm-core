import { ApiProperty } from '@nestjs/swagger';
import { DashboardWidgetKey } from '../enums/dashboard-widget-key.enum.js';
import { WidgetKind } from '../enums/widget-kind.enum.js';
import { WidgetBreakdownDto } from './widget-breakdown.dto.js';
import { WidgetFunnelDto } from './widget-funnel.dto.js';
import { WidgetHeatmapDto } from './widget-heatmap.dto.js';
import { WidgetMetaDto } from './widget-meta.dto.js';
import { WidgetMetricDto } from './widget-metric.dto.js';
import { WidgetSeriesDto } from './widget-series.dto.js';

export class WidgetDto {
  @ApiProperty({ enum: DashboardWidgetKey })
  key: DashboardWidgetKey;

  @ApiProperty({ enum: WidgetKind })
  kind: WidgetKind;

  @ApiProperty({ type: () => WidgetMetricDto, required: false })
  metric?: WidgetMetricDto;

  @ApiProperty({ type: () => WidgetSeriesDto, required: false })
  series?: WidgetSeriesDto;

  @ApiProperty({ type: () => WidgetBreakdownDto, required: false })
  breakdown?: WidgetBreakdownDto;

  @ApiProperty({ type: () => WidgetHeatmapDto, required: false })
  heatmap?: WidgetHeatmapDto;

  @ApiProperty({ type: () => WidgetFunnelDto, required: false })
  funnel?: WidgetFunnelDto;

  @ApiProperty({ type: () => WidgetMetaDto, required: false })
  meta?: WidgetMetaDto;
}
