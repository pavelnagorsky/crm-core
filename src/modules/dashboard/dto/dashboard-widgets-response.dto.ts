import { ApiProperty } from '@nestjs/swagger';
import { WidgetDto } from './widget.dto.js';

export class DashboardWidgetsResponseDto {
  @ApiProperty({ type: () => WidgetDto, isArray: true })
  widgets: WidgetDto[];

  constructor(widgets: WidgetDto[]) {
    this.widgets = widgets;
  }
}
