import { BusinessRole } from '@prisma/client';
import { Permission } from './permission.interface.js';

export interface PermissionActionDefinition {
  configurable: readonly BusinessRole[];
  dependencies: readonly Permission[];
}
