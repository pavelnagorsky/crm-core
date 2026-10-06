import { DashboardWidgetsRequestDto } from '../dto/dashboard-widgets-request.dto.js';
import { ResolvedRange } from './resolved-range.interface.js';

export interface WidgetContext {
  locationId: string;
  dto: DashboardWidgetsRequestDto;
  range: ResolvedRange;
}
