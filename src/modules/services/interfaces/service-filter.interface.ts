import { ServiceStatus } from '../enums/service-status.enum.js';

export interface ServiceFilter {
  search?: string;
  categoryId?: string;
  status?: ServiceStatus;
}
