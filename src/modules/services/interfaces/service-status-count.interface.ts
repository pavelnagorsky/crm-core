import { ServiceStatus } from '../enums/service-status.enum.js';

export interface ServiceStatusCount {
  status: ServiceStatus;
  count: number;
}
