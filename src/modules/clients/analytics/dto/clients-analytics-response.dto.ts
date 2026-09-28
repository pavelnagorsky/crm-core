import { ApiProperty } from '@nestjs/swagger';
import { WidgetDto } from '../../../dashboard/dto/widget.dto.js';

export class ClientsAnalyticsResponseDto {
  @ApiProperty({ type: () => WidgetDto, isArray: true })
  widgets: WidgetDto[];

  constructor(widgets: WidgetDto[]) {
    this.widgets = widgets;
  }
}
