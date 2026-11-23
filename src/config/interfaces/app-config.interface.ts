import { AppRole } from '../../shared/enums/app-role.enum.js';

export interface IAppConfig {
  locale: string;
  role: AppRole;
}
