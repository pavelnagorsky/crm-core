import { Injectable, OnModuleInit } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import Handlebars from 'handlebars';
import type { AuditLog } from '@prisma/client';
import { AuditEntity } from '../enums/audit-entity.enum.js';
import { AuditActorRole } from '../enums/audit-actor-role.enum.js';

const ROLE_LABELS: Record<AuditActorRole, string> = {
  [AuditActorRole.CLIENT]: 'клиент',
  [AuditActorRole.STAFF]: 'менеджер',
  [AuditActorRole.OWNER]: 'владелец',
  [AuditActorRole.SYSTEM]: 'система',
};

const BOOKING_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Ожидает подтверждения',
  CONFIRMED: 'Подтверждено',
  CANCELLED: 'Отменено',
  COMPLETED: 'Завершено',
  NO_SHOW: 'Не явился',
};

type CompiledTemplate = Handlebars.TemplateDelegate;

@Injectable()
export class AuditRendererService implements OnModuleInit {
  private readonly hbs: typeof Handlebars;
  private templates = new Map<AuditEntity, CompiledTemplate>();

  constructor() {
    // Create an isolated Handlebars environment so helpers don't pollute the
    // global singleton and don't re-register on hot-reload restarts.
    this.hbs = Handlebars.create();
    this.hbs.registerHelper('eq', (a: unknown, b: unknown) => a === b);
    this.hbs.registerHelper('roleName', (role: AuditActorRole) => ROLE_LABELS[role] ?? role);
    this.hbs.registerHelper('bookingStatus', (status: string) => BOOKING_STATUS_LABELS[status] ?? status);
  }

  onModuleInit() {
    const dir = join(fileURLToPath(import.meta.url), '..', '..', 'templates');

    for (const entity of Object.values(AuditEntity)) {
      const file = join(dir, `${entity.toLowerCase()}.hbs`);
      const source = readFileSync(file, 'utf-8');
      this.templates.set(entity, this.hbs.compile(source));
    }
  }

  render(log: AuditLog): string {
    const template = this.templates.get(log.entityType as AuditEntity);
    if (!template) return '';
    return template({
      eventType: log.eventType,
      actorName: log.actorName,
      actorRole: log.actorRole,
      payload: log.payload,
    }).trim();
  }
}
