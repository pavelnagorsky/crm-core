import { ValidationPipe } from '@nestjs/common';
import { BusinessType } from '@prisma/client';
import { CreateBrandDto } from '../../brand/dto/create-brand.dto.js';
import { CreateLocationDto } from './create-location.dto.js';
import { UpdateLocationDto } from './update-location.dto.js';

describe('Location request contracts', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true });

  it('accepts all advertised types both at creation and editing', async () => {
    for (const businessType of Object.values(BusinessType)) {
      await expect(
        pipe.transform(
          {
            name: 'Location',
            countryCode: 'BY',
            currency: 'BYN',
            timezone: 'Europe/Minsk',
            businessType,
          },
          { type: 'body', metatype: CreateLocationDto },
        ),
      ).resolves.toMatchObject({ businessType });
      await expect(
        pipe.transform(
          { businessType },
          { type: 'body', metatype: UpdateLocationDto },
        ),
      ).resolves.toMatchObject({ businessType });
    }
  });

  it('allows clearing the type and rejects unknown types on editing', async () => {
    await expect(
      pipe.transform(
        { businessType: null },
        { type: 'body', metatype: UpdateLocationDto },
      ),
    ).resolves.toMatchObject({ businessType: null });
    await expect(
      pipe.transform(
        { businessType: 'UNKNOWN' },
        { type: 'body', metatype: UpdateLocationDto },
      ),
    ).rejects.toThrow();
  });

  it.each([undefined, null, []])(
    'requires a first location object: %j',
    async (location) => {
      await expect(
        pipe.transform(
          { name: 'Brand', location },
          { type: 'body', metatype: CreateBrandDto },
        ),
      ).rejects.toThrow();
    },
  );

  describe.each([CreateLocationDto, UpdateLocationDto])(
    '%s contacts',
    (metatype) => {
      const base = {
        name: 'Location',
        countryCode: 'BY',
        currency: 'BYN',
        timezone: 'Europe/Minsk',
      };
      const fields = [
        'phone',
        'instagram',
        'telegram',
        'whatsapp',
        'website',
        'mapWidgetUrl',
      ];
      const transform = (contacts: Record<string, unknown>) =>
        pipe.transform({ ...base, ...contacts }, { type: 'body', metatype });

      it('leaves omitted fields undefined', async () => {
        const dto = await transform({});
        for (const field of fields) expect(dto[field]).toBeUndefined();
      });

      it.each([null, '', '   '])(
        'clears all contacts with %j',
        async (value) => {
          const dto = await transform(
            Object.fromEntries(fields.map((field) => [field, value])),
          );
          for (const field of fields) expect(dto[field]).toBeNull();
        },
      );

      it.each([42, false, {}, []])(
        'rejects non-string contacts: %j',
        async (value) => {
          for (const field of fields) {
            await expect(transform({ [field]: value })).rejects.toThrow();
          }
        },
      );

      it.each(['+375292332000', '+79991234567', '+77011234567'])(
        'accepts a canonical supported phone: %s',
        async (phone) => {
          await expect(transform({ phone })).resolves.toMatchObject({ phone });
        },
      );

      it.each([
        '+12025550123',
        '+380501234567',
        '+37529233200',
        '+799912345678',
        '80292332000',
        '+375 29 233 20 00',
        'abc',
      ])('rejects a non-canonical or unsupported phone: %s', async (phone) => {
        await expect(transform({ phone })).rejects.toThrow();
      });

      describe.each(['instagram', 'telegram', 'whatsapp', 'website'])(
        '%s',
        (field) => {
          it.each([
            '@studio',
            'studio',
            'https://example.com/studio',
            'http://example.com',
            'HTTPS://example.com',
            'a'.repeat(255),
          ])('trims and preserves owner input: %s', async (value) => {
            await expect(
              transform({ [field]: '  ' + value + '  ' }),
            ).resolves.toMatchObject({ [field]: value });
          });

          it.each([
            'javascript:alert(1)',
            'data:text/html,test',
            'tg://resolve?domain=studio',
            'ftp://example.com',
            'mailto:test@example.com',
            'JaVaScRiPt:alert(1)',
            'a'.repeat(256),
          ])('rejects invalid contact: %s', async (value) => {
            await expect(transform({ [field]: value })).rejects.toThrow();
          });
        },
      );

      it('extracts the iframe URL and decodes HTML attributes', async () => {
        await expect(
          transform({
            mapWidgetUrl:
              '<iframe width="560" src="https://yandex.ru/map-widget/v1/?um=constructor%3Aid&amp;source=constructor"></iframe>',
          }),
        ).resolves.toMatchObject({
          mapWidgetUrl:
            'https://yandex.ru/map-widget/v1/?um=constructor%3Aid&source=constructor',
        });
        await expect(
          transform({
            mapWidgetUrl:
              "<IFRAME src='https://yandex.by/map-widget/v1/'></IFRAME>",
          }),
        ).resolves.toMatchObject({
          mapWidgetUrl: 'https://yandex.by/map-widget/v1/',
        });
      });

      it('accepts a trimmed map URL up to 2048 characters', async () => {
        const prefix = 'https://yandex.ru/map-widget/v1/?id=';
        const mapWidgetUrl = prefix + 'a'.repeat(2048 - prefix.length);
        await expect(
          transform({ mapWidgetUrl: '  ' + mapWidgetUrl + ' ' }),
        ).resolves.toMatchObject({ mapWidgetUrl });
        await expect(
          transform({ mapWidgetUrl: mapWidgetUrl + 'a' }),
        ).rejects.toThrow();
      });

      it.each([
        'http://yandex.ru/map-widget/v1/',
        '//yandex.ru/map-widget/v1/',
        'javascript:alert(1)',
        'https://yandex.ru/maps/',
        'https://yandex.ru/?next=/map-widget/',
        'https://yandex.ru/#/map-widget/',
        'https://yandex.ru/map-widget',
        '<iframe src="http://yandex.ru/map-widget/v1/"></iframe>',
        '<iframe src="javascript:alert(1)"></iframe>',
        '<iframe src=""></iframe>',
        '<iframe data-src="https://yandex.ru/map-widget/v1/"></iframe>',
        '<iframe title="src=hello"></iframe>',
        '<iframe src="https://yandex.ru/map-widget/v1/"></iframe><iframe src="https://yandex.ru/map-widget/v1/"></iframe>',
      ])('rejects invalid map input: %s', async (mapWidgetUrl) => {
        await expect(transform({ mapWidgetUrl })).rejects.toThrow();
      });
    },
  );
});
