import { DashboardWidgetsRequestDto } from '../dto/dashboard-widgets-request.dto.js';
import { ResolvedRange } from './resolved-range.interface.js';

export interface WidgetContext {
  dto: DashboardWidgetsRequestDto;
  range: ResolvedRange;
}
