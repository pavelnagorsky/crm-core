import { BusinessRole, UserRole } from '@prisma/client';
import { TokenPayloadDto } from '../../auth/dto/token-payload.dto.js';
import { AuditActor } from '../interfaces/audit-actor.interface.js';
import { AuditActorRole } from '../enums/audit-actor-role.enum.js';

export function auditActorFromToken(payload: TokenPayloadDto, businessId: string): AuditActor {
  const name = [payload.firstName, payload.lastName].filter(Boolean).join(' ') || 'Пользователь';

  if (payload.role === UserRole.ADMIN) {
    return { id: payload.sub, name, role: AuditActorRole.SUPPORT };
  }

  const membership = payload.memberships.find((m) => m.businessId === businessId);
  const role = membership?.role === BusinessRole.OWNER ? AuditActorRole.OWNER : AuditActorRole.STAFF;
  return { id: payload.sub, name, role };
}
