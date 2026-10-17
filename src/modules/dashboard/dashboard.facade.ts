import { Injectable } from '@nestjs/common';
import { DashboardWidgetsRequestDto } from './dto/dashboard-widgets-request.dto.js';
import { WidgetDto } from './dto/widget.dto.js';
import { DashboardWidgetFactory } from './factories/dashboard-widget.factory.js';
import { DashboardContextService } from './services/dashboard-context.service.js';
import { DashboardRangeService } from './services/dashboard-range.service.js';

@Injectable()
export class DashboardFacade {
  constructor(
    private readonly rangeService: DashboardRangeService,
    private readonly context: DashboardContextService,
    private readonly widgets: DashboardWidgetFactory,
  ) {}
  async getWidgets(
    locationId: string,
    dto: DashboardWidgetsRequestDto,
  ): Promise<WidgetDto[]> {
    const range = await this.rangeService.resolve(locationId, dto);
    const ctx = await this.context.load(locationId, dto, range);
    return dto.keys.map((key) => this.widgets.build(key, ctx));
  }
}
