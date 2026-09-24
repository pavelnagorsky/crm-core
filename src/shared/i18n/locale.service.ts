import { Injectable, OnModuleInit } from '@nestjs/common';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { I18nLocale } from '../interfaces/i18n-locale.interface.js';

export const DEFAULT_LANG = 'ru';

@Injectable()
export class LocaleService implements OnModuleInit {
  private readonly locales = new Map<string, I18nLocale>();

  onModuleInit(): void {
    const dir = join(fileURLToPath(import.meta.url), '..');
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.json')) continue;
      const lang = file.slice(0, -'.json'.length);
      this.locales.set(lang, JSON.parse(readFileSync(join(dir, file), 'utf-8')) as I18nLocale);
    }
    if (!this.locales.has(DEFAULT_LANG)) {
      throw new Error(`Default locale "${DEFAULT_LANG}" is missing`);
    }
  }

  get(lang = DEFAULT_LANG): I18nLocale {
    return this.locales.get(lang) ?? this.locales.get(DEFAULT_LANG)!;
  }
}
