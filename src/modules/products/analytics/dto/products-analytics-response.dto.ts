import { ApiProperty } from '@nestjs/swagger';
import { WidgetDto } from '../../../dashboard/dto/widget.dto.js';

export class ProductsAnalyticsResponseDto {
  @ApiProperty({ type: () => WidgetDto, isArray: true })
  widgets: WidgetDto[];

  @ApiProperty({
    type: String,
    format: 'uuid',
    isArray: true,
    description: 'Actual locations included in the calculation.',
  })
  locationIds: string[];

  constructor(widgets: WidgetDto[], locationIds: string[]) {
    this.widgets = widgets;
    this.locationIds = locationIds;
  }
}
