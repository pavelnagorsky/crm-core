import { ApiProperty } from '@nestjs/swagger';
import { SeriesGranularity } from '../enums/series-granularity.enum.js';
import { WidgetSeriesPointDto } from './widget-series-point.dto.js';

export class WidgetSeriesDto {
  @ApiProperty({ enum: SeriesGranularity })
  granularity: SeriesGranularity;

  @ApiProperty({ type: () => WidgetSeriesPointDto, isArray: true })
  points: WidgetSeriesPointDto[];

  @ApiProperty({ type: () => WidgetSeriesPointDto, isArray: true, required: false, description: 'Previous-period series, positionally aligned with points[]' })
  comparisonPoints?: WidgetSeriesPointDto[];
}
