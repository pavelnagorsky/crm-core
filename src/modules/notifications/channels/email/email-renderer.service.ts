import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import Handlebars from 'handlebars';
import { format, isValid } from 'date-fns';
import { ru as dateFnsRu, type Locale as DateFnsLocale } from 'date-fns/locale';
import { IAppConfig } from '../../../../config/configuration.js';
import { I18nLocale } from '../../interfaces/i18n-locale.interface.js';

export type EmailTemplate =
  | 'confirm-email'
  | 'reset-password'
  | 'staff-invitation'
  | 'booking-confirmed'
  | 'booking-cancelled';

type CompiledTemplate = Handlebars.TemplateDelegate;

const DATE_FNS_LOCALES: Record<string, object> = { ru: dateFnsRu };
const EMAIL_TEMPLATES: EmailTemplate[] = [
  'confirm-email',
  'reset-password',
  'staff-invitation',
  'booking-confirmed',
  'booking-cancelled',
];

@Injectable()
export class EmailRendererService implements OnModuleInit {
  private readonly hbs: typeof Handlebars;
  private readonly contentTemplates = new Map<string, CompiledTemplate>();
  private readonly lang: string;
  private locale!: I18nLocale;
  private layoutTemplate!: CompiledTemplate;

  constructor(private readonly config: ConfigService) {
    this.hbs = Handlebars.create();
    this.lang = this.config.get<IAppConfig>('app')!.locale;
    this.registerHelpers();
  }

  onModuleInit() {
    const i18nDir = join(fileURLToPath(import.meta.url), '..', '..', '..', '..', '..', 'shared', 'i18n');
    const templatesDir = join(fileURLToPath(import.meta.url), '..', 'templates');

    this.locale = JSON.parse(readFileSync(join(i18nDir, `${this.lang}.json`), 'utf-8'));
    this.layoutTemplate = this.hbs.compile(readFileSync(join(templatesDir, 'layout.hbs'), 'utf-8'));

    for (const name of EMAIL_TEMPLATES) {
      const source = readFileSync(join(templatesDir, this.lang, `${name}.hbs`), 'utf-8');
      this.contentTemplates.set(name, this.hbs.compile(source));
    }
  }

  render(template: EmailTemplate, data: Record<string, unknown>): { subject: string; html: string } {
    const contentTemplate = this.contentTemplates.get(template);
    if (!contentTemplate) throw new Error(`Email template not found: ${template}`);

    const subject = this.locale.email[template]?.subject ?? template;
    const ctx = { ...data, locale: this.locale, lang: this.lang };

    const content = contentTemplate(ctx);
    const html = this.layoutTemplate({ subject, content, lang: this.lang, locale: this.locale });

    return { subject, html };
  }

  private registerHelpers() {
    this.hbs.registerHelper('t', (...rawArgs: unknown[]) => {
      const opts = rawArgs[rawArgs.length - 1] as Handlebars.HelperOptions;
      const keys = rawArgs.slice(0, -1) as string[];
      const locale: I18nLocale = opts.data?.root?.locale;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const value = keys.reduce<any>((node, key) => node?.[key], locale);
      return typeof value === 'string' ? new Handlebars.SafeString(value) : keys[keys.length - 1];
    });

    this.hbs.registerHelper('formatDateTime', (...rawArgs: unknown[]) => {
      const value = rawArgs[0] as string | Date;
      return this.formatDate(value, 'd MMM yyyy, HH:mm');
    });

    this.hbs.registerHelper('formatTime', (...rawArgs: unknown[]) => {
      const value = rawArgs[0] as string | Date;
      return this.formatDate(value, 'HH:mm');
    });
  }

  private formatDate(value: string | Date, pattern: string): string {
    const d = new Date(value);
    if (!isValid(d)) return String(value);
    return format(d, pattern, { locale: (DATE_FNS_LOCALES[this.lang] ?? dateFnsRu) as DateFnsLocale });
  }
}
