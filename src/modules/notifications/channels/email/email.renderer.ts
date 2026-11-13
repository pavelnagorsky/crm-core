import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import Handlebars from 'handlebars';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { IAppConfig } from '../../../../config/interfaces/app-config.interface.js';
import { I18nLocale } from '../../../../shared/interfaces/i18n-locale.interface.js';
import { RenderedEmail } from '../../interfaces/rendered-email.interface.js';

export type EmailTemplate =
  | 'confirm-email'
  | 'reset-password'
  | 'access-invitation'
  | 'booking-confirmed'
  | 'booking-pending'
  | 'booking-status-changed'
  | 'booking-reminder'
  | 'review-request'
  | 'staff-booking-event';

type CompiledTemplate = Handlebars.TemplateDelegate;

const LANG_TO_INTL_LOCALE: Record<string, string> = { ru: 'ru-RU' };
const EMAIL_TEMPLATES: EmailTemplate[] = [
  'confirm-email',
  'reset-password',
  'access-invitation',
  'booking-confirmed',
  'booking-pending',
  'booking-status-changed',
  'booking-reminder',
  'review-request',
  'staff-booking-event',
];

@Injectable()
export class EmailRenderer implements OnModuleInit {
  private readonly hbs: typeof Handlebars;
  private readonly contentTemplates = new Map<string, CompiledTemplate>();
  private readonly lang: string;
  private locale!: I18nLocale;
  private layoutTemplate!: CompiledTemplate;
  private platformLogo!: Buffer;

  constructor(private readonly config: ConfigService) {
    this.hbs = Handlebars.create();
    this.lang = this.config.get<IAppConfig>('app')!.locale;
    this.registerHelpers();
  }

  onModuleInit() {
    const i18nDir = join(
      fileURLToPath(import.meta.url),
      '..',
      '..',
      '..',
      '..',
      '..',
      'shared',
      'i18n',
    );
    const templatesDir = join(
      fileURLToPath(import.meta.url),
      '..',
      'templates',
    );

    this.locale = JSON.parse(
      readFileSync(join(i18nDir, `${this.lang}.json`), 'utf-8'),
    );
    this.layoutTemplate = this.hbs.compile(
      readFileSync(join(templatesDir, 'layout.hbs'), 'utf-8'),
    );
    this.platformLogo = readFileSync(
      join(templatesDir, '..', 'assets', 'klendo-logo.png'),
    );

    this.hbs.registerPartial(
      'bookingDetails',
      readFileSync(
        join(templatesDir, this.lang, 'partials', 'booking-details.hbs'),
        'utf-8',
      ),
    );
    for (const name of EMAIL_TEMPLATES) {
      const source = readFileSync(
        join(templatesDir, this.lang, `${name}.hbs`),
        'utf-8',
      );
      this.contentTemplates.set(name, this.hbs.compile(source));
    }
  }

  render(
    template: EmailTemplate,
    data: Record<string, unknown>,
  ): RenderedEmail {
    const contentTemplate = this.contentTemplates.get(template);
    if (!contentTemplate)
      throw new Error(`Email template not found: ${template}`);

    const isPlatform =
      template === 'confirm-email' || template === 'reset-password';
    const senderName = isPlatform
      ? 'Klendo'
      : String(data.brandName ?? '').trim();
    if (!senderName)
      throw new Error(`Brand name required for email: ${template}`);
    const logoUrl = isPlatform
      ? 'cid:klendo-logo'
      : typeof data.brandLogoUrl === 'string' &&
          data.brandLogoUrl.startsWith('https://')
        ? data.brandLogoUrl
        : undefined;
    const ctx = { ...data, locale: this.locale, lang: this.lang };
    const texts = this.texts(template, data.variant);
    const title = texts.subject ? this.text(texts.subject, ctx) : template;
    const subject = `${senderName} — ${title}`;
    const heading = texts.heading ? this.text(texts.heading, ctx) : title;

    const content = contentTemplate(ctx);
    const html = this.layoutTemplate({
      subject,
      heading,
      senderName,
      logoUrl,
      isPlatform,
      brandingClass: isPlatform ? 'platform' : 'business',
      content,
      lang: this.lang,
      locale: this.locale,
    });

    return {
      subject,
      html,
      senderName,
      ...(isPlatform
        ? {
            attachments: [
              {
                filename: 'klendo-logo.png',
                content: this.platformLogo,
                contentType: 'image/png',
                contentDisposition: 'inline' as const,
                cid: 'klendo-logo',
              },
            ],
          }
        : {}),
    };
  }

  /** Subject and heading of the template, or of its `variant` section when the data names one. */
  private texts(
    template: EmailTemplate,
    variant: unknown,
  ): { subject?: string; heading?: string } {
    const section = this.locale.email[template] as
      Record<string, unknown> | undefined;
    const own =
      typeof variant === 'string'
        ? (section?.[variant] as Record<string, unknown> | undefined)
        : undefined;
    const pick = (key: 'subject' | 'heading') => {
      const value = own?.[key] ?? section?.[key];
      return typeof value === 'string' ? value : undefined;
    };
    return { subject: pick('subject'), heading: pick('heading') };
  }

  /** Subjects and headings may name booking data, e.g. the visit time. Plain text, escaped by the layout. */
  private text(source: string, ctx: Record<string, unknown>): string {
    return this.hbs.compile(source, { noEscape: true })(ctx);
  }

  private registerHelpers() {
    this.hbs.registerHelper('t', (...rawArgs: unknown[]) => {
      const opts = rawArgs[rawArgs.length - 1] as Handlebars.HelperOptions;
      const keys = rawArgs.slice(0, -1) as string[];
      const locale: I18nLocale = opts.data?.root?.locale;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const value = keys.reduce<any>((node, key) => node?.[key], locale);
      return typeof value === 'string'
        ? new Handlebars.SafeString(value)
        : keys[keys.length - 1];
    });

    this.hbs.registerHelper('formatDateTime', (...rawArgs: unknown[]) => {
      const opts = rawArgs[rawArgs.length - 1] as Handlebars.HelperOptions;
      const value = rawArgs[0] as string | Date;
      const timezone: string = opts.data?.root?.timezone ?? 'UTC';
      return this.formatDate(value, timezone, true);
    });

    // "суббота, 14 ноября в 15:00"; `short` gives "сб, …". The year only when it is not this year.
    this.hbs.registerHelper('formatVisit', (...rawArgs: unknown[]) => {
      const opts = rawArgs[rawArgs.length - 1] as Handlebars.HelperOptions;
      const value = rawArgs[0] as string | Date;
      const short = rawArgs.length > 2 && rawArgs[1] === 'short';
      const timezone: string = opts.data?.root?.timezone ?? 'UTC';
      return this.formatVisit(value, timezone, short);
    });

    this.hbs.registerHelper('formatTime', (...rawArgs: unknown[]) => {
      const opts = rawArgs[rawArgs.length - 1] as Handlebars.HelperOptions;
      const value = rawArgs[0] as string | Date;
      const timezone: string = opts.data?.root?.timezone ?? 'UTC';
      return this.formatDate(value, timezone, false, true);
    });
  }

  private formatVisit(
    value: string | Date,
    timezone: string,
    short: boolean,
  ): string {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    const intlLocale = LANG_TO_INTL_LOCALE[this.lang] ?? 'ru-RU';
    const year = (date: Date) =>
      new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
      }).format(date);
    return new Intl.DateTimeFormat(intlLocale, {
      timeZone: timezone,
      weekday: short ? 'short' : 'long',
      day: 'numeric',
      month: 'long',
      ...(year(d) !== year(new Date()) && { year: 'numeric' }),
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d);
  }

  private formatDate(
    value: string | Date,
    timezone: string,
    withDate = true,
    timeOnly = false,
  ): string {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    const intlLocale = LANG_TO_INTL_LOCALE[this.lang] ?? 'ru-RU';
    const options: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      hour12: false,
    };
    if (timeOnly) {
      options.hour = '2-digit';
      options.minute = '2-digit';
    } else {
      options.day = 'numeric';
      options.month = 'short';
      options.year = 'numeric';
      if (withDate) {
        options.hour = '2-digit';
        options.minute = '2-digit';
      }
    }
    return new Intl.DateTimeFormat(intlLocale, options).format(d);
  }
}
