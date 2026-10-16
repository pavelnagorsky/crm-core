import { BusinessRole } from '@prisma/client';
import { Permission } from '../enums/permission.enum.js';
export interface PermissionDefinition {
  scope: 'B' | 'G' | 'L' | 'B/L';
  defaults: readonly BusinessRole[];
  configurable: readonly BusinessRole[];
  dependencies: readonly Permission[];
}
