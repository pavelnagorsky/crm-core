import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

@Injectable()
export class WidgetPageUrlPipe implements PipeTransform {
  transform(value: string | undefined): string | null {
    if (value === undefined) return null;
    if (
      typeof value !== 'string' ||
      value.length === 0 ||
      value.length > 4096
    ) {
      throw new BadRequestException(
        'X-Widget-Page-Url must be an HTTP(S) URL of at most 4096 characters',
      );
    }
    try {
      const url = new URL(value);
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password
      ) {
        throw new Error('Invalid page URL');
      }
    } catch {
      throw new BadRequestException(
        'X-Widget-Page-Url must be an HTTP(S) URL without credentials',
      );
    }
    return value;
  }
}
