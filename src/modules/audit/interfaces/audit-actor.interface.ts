import { AuditActorRole } from '../enums/audit-actor-role.enum.js';

export interface AuditActor {
  id?: string;
  name: string;
  role: AuditActorRole;
}
