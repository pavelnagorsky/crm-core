import { Injectable, OnModuleInit } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import Handlebars from 'handlebars';
import { format, isValid } from 'date-fns';
import { ru as dateFnsRu } from 'date-fns/locale';
import type { AuditLog } from '@prisma/client';
import { AuditEntity } from '../enums/audit-entity.enum.js';
import { AUDIT_FIELD_TYPES } from '../fields/index.js';

interface Locale {
  actorRole: Record<string, string>;
  bookingStatus: Record<string, string>;
  fields: Record<string, Record<string, string>>;
}

type CompiledTemplate = Handlebars.TemplateDelegate;

const DATE_FNS_LOCALES: Record<string, object> = {
  ru: dateFnsRu,
};

const SUPPORTED_LANGS = ['ru'] as const;

@Injectable()
export class AuditRendererService implements OnModuleInit {
  private readonly hbs: typeof Handlebars;
  private readonly templates = new Map<string, CompiledTemplate>();
  private readonly locales = new Map<string, Locale>();

  constructor() {
    // Create an isolated Handlebars environment so helpers don't pollute the
    // global singleton and don't re-register on hot-reload restarts.
    this.hbs = Handlebars.create();
    this.registerHelpers();
  }

  onModuleInit() {
    const i18nDir = join(fileURLToPath(import.meta.url), '..', '..', '..', '..', 'shared', 'i18n');
    const templatesDir = join(fileURLToPath(import.meta.url), '..', '..', 'templates');

    for (const lang of SUPPORTED_LANGS) {
      this.locales.set(lang, JSON.parse(readFileSync(join(i18nDir, `${lang}.json`), 'utf-8')));

      for (const entity of Object.values(AuditEntity)) {
        const source = readFileSync(join(templatesDir, lang, `${entity.toLowerCase()}.hbs`), 'utf-8');
        this.templates.set(`${lang}:${entity}`, this.hbs.compile(source));
      }
    }
  }

  render(log: AuditLog, lang = 'ru'): string {
    const resolvedLang = this.locales.has(lang) ? lang : 'ru';
    const template = this.templates.get(`${resolvedLang}:${log.entityType}`);
    const locale = this.locales.get(resolvedLang)!;
    if (!template) return '';
    return template({
      entityType: log.entityType,
      eventType: log.eventType,
      actorName: log.actorName,
      actorRole: log.actorRole,
      payload: log.payload,
      locale,
      lang: resolvedLang,
    }).trim();
  }

  private registerHelpers() {
    this.hbs.registerHelper('eq', (a: unknown, b: unknown) => a === b);

    // All helpers read locale/lang from @root so they work correctly inside {{#each}} blocks
    this.hbs.registerHelper('t', (...rawArgs: unknown[]) => {
      const opts = rawArgs[rawArgs.length - 1] as Handlebars.HelperOptions;
      const keys = rawArgs.slice(0, -1) as string[];
      const locale: Locale = opts.data?.root?.locale;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const value = keys.reduce<any>((node, key) => node?.[key], locale);
      return typeof value === 'string' ? value : keys[keys.length - 1];
    });

    this.hbs.registerHelper('formatValue', (...rawArgs: unknown[]) => {
      const opts = rawArgs[rawArgs.length - 1] as Handlebars.HelperOptions;
      const [field, value] = rawArgs as [string, string];
      if (!value || value === '—') return '—';
      const type = AUDIT_FIELD_TYPES[field];
      if (!type) return value;
      const lang: string = opts.data?.root?.lang ?? 'ru';
      const pattern = type === 'datetime' ? 'd MMM yyyy, HH:mm' : 'd MMM yyyy';
      return this.formatDate(value, pattern, lang);
    });

    this.hbs.registerHelper('formatDateTime', (...rawArgs: unknown[]) => {
      const opts = rawArgs[rawArgs.length - 1] as Handlebars.HelperOptions;
      const value = rawArgs[0] as string;
      if (!value || value === '—') return '—';
      const lang: string = opts.data?.root?.lang ?? 'ru';
      return this.formatDate(value, 'd MMM yyyy, HH:mm', lang);
    });
  }

  private formatDate(iso: string, pattern: string, lang: string): string {
    const d = new Date(iso);
    if (!isValid(d)) return iso;
    return format(d, pattern, { locale: (DATE_FNS_LOCALES[lang] ?? dateFnsRu) as Parameters<typeof format>[2]['locale'] });
  }
}
