import { ApiProperty } from '@nestjs/swagger';
import { WidgetFunnelStepDto } from './widget-funnel-step.dto.js';

export class WidgetFunnelDto {
  @ApiProperty({ type: () => WidgetFunnelStepDto, isArray: true })
  steps: WidgetFunnelStepDto[];
}
