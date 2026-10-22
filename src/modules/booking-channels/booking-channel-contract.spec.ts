import { GUARDS_METADATA } from '@nestjs/common/constants';
import { plainToInstance } from 'class-transformer';
import { BookingWidget } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { TokenEpochGuard } from '../auth/guards/token-epoch.guard.js';
import { PERMISSIONS_KEY } from '../auth/guards/permission.guard.js';
import { LocationPublicProfile } from '../location/interfaces/location-public-profile.interface.js';
import { BookingSetupResponseDto } from '../bookings/dto/booking-setup-response.dto.js';
import { BookingPalettesController } from './controllers/booking-palettes.controller.js';
import { BookingPageResponseDto } from './dto/booking-page-response.dto.js';
import { BookingWidgetResponseDto } from './dto/booking-widget-response.dto.js';
import { PublicBookingPageResponseDto } from './dto/public-booking-page-response.dto.js';
import { PublicBookingWidgetResponseDto } from './dto/public-booking-widget-response.dto.js';
import { SaveBookingPageDto } from './dto/save-booking-page.dto.js';
import { SaveBookingWidgetDto } from './dto/save-booking-widget.dto.js';
import { BookingPalette } from './enums/booking-palette.enum.js';
import { BookingPageWithCover } from './interfaces/booking-page-with-cover.interface.js';
import { BookingPagesService } from './services/booking-pages.service.js';
import { BookingWidgetsService } from './services/booking-widgets.service.js';

const form = {
  paletteId: BookingPalette.SAGE,
  customPalette: null,
  headline: 'Запись',
  caption: 'Выберите услугу',
  showStaff: true,
  showBranding: false,
};
const pageInput = {
  title: 'Internal CRM title',
  heading: null,
  slug: 'salon',
  tagline: 'Tagline',
  html: '<p>Description</p>',
  metaTitle: 'SEO title',
  metaDescription: 'SEO description',
  coverFileId: null,
  form,
};
const widgetInput = {
  title: 'Widget',
  placement: 'DIALOG',
  trigger: 'FLOATING_BUTTON',
  buttonPosition: 'BOTTOM_RIGHT',
  allowedDomains: [],
  form,
};
const location = {
  id: 'location',
  name: 'Internal location name',
  city: 'Минск',
  addressLine: 'Address',
  brand: { name: 'Brand', logoFile: null },
} as LocationPublicProfile;
const setup = new BookingSetupResponseDto();

function repository() {
  return {
    findUnique: vi.fn().mockResolvedValue(null),
    findFirst: vi
      .fn()
      .mockImplementation(async ({ where }) =>
        where.titleKey ? null : { id: 'channel' },
      ),
    create: vi.fn().mockImplementation(async ({ data }) => ({
      id: 'channel',
      status: 'DRAFT',
      coverFile: null,
      ...data,
    })),
    update: vi.fn().mockImplementation(async ({ data }) => ({
      id: 'channel',
      locationId: 'location',
      status: 'PUBLISHED',
      coverFile: null,
      ...data,
    })),
  };
}

describe('booking channel contract', () => {
  const db = { bookingPage: repository(), bookingWidget: repository() };
  const files = { findById: vi.fn() };
  const pages = new BookingPagesService(
    db as never,
    files as never,
    {} as never,
  );
  const widgets = new BookingWidgetsService(db as never, {} as never);
  beforeEach(() => vi.clearAllMocks());

  it.each(['create', 'update'] as const)(
    '%s persists heading and maps it unchanged in admin and public responses',
    async (operation) => {
      for (const heading of [
        '  Public title  ',
        null,
        '',
        '<b>Plain text</b>',
      ]) {
        const dto = plainToInstance(SaveBookingPageDto, {
          ...pageInput,
          heading,
        });
        const saved =
          operation === 'create'
            ? await pages.create('location', dto)
            : await pages.update('location', 'channel', dto);
        expect(db.bookingPage[operation]).toHaveBeenLastCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ heading: dto.heading }),
          }),
        );
        expect(BookingPageResponseDto.fromEntity(saved).heading).toBe(
          dto.heading,
        );
        const response = PublicBookingPageResponseDto.from(
          saved,
          location,
          setup,
        );
        expect(response.page.heading).toBe(dto.heading);
        expect(response.page).toMatchObject({
          html: pageInput.html,
          tagline: pageInput.tagline,
          metaTitle: pageInput.metaTitle,
        });
        expect(response.location).toMatchObject({
          brandName: 'Brand',
          city: 'Минск',
          addressLine: 'Address',
        });
      }
    },
  );

  it('preserves cover resolution and response mapping', async () => {
    const coverFile = {
      id: 'cover',
      mimeType: 'image/jpeg',
      fileName: 'cover.jpg',
      url: 'https://example.com/cover.jpg',
    };
    files.findById.mockResolvedValue(coverFile);
    const dto = plainToInstance(SaveBookingPageDto, {
      ...pageInput,
      coverFileId: 'cover',
    });
    const saved = await pages.create('location', dto);
    expect(saved.coverFileId).toBe('cover');
    expect(files.findById).toHaveBeenCalledWith('cover');
    const withCover = { ...saved, coverFile } as BookingPageWithCover;
    const expected = { id: 'cover', name: 'cover.jpg', url: coverFile.url };
    expect(BookingPageResponseDto.fromEntity(withCover).cover).toEqual(
      expected,
    );
    expect(
      PublicBookingPageResponseDto.from(withCover, location, setup).page.cover,
    ).toEqual(expected);
  });

  it('serves an authenticated catalog without a scoped permission', async () => {
    const handler = BookingPalettesController.prototype.palettes;
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([
      JwtAuthGuard,
      TokenEpochGuard,
    ]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toBeUndefined();
    const response = await new BookingPalettesController().palettes();
    expect(response.isSuccess).toBe(true);
    const catalog = response.responseValue!;
    expect(catalog.presets.map((preset) => preset.id)).toEqual(
      Object.values(BookingPalette).filter((id) => id !== 'CUSTOM'),
    );
    expect(catalog.defaultPaletteId).toBe('INK');
    expect(
      catalog.presets.some((preset) => preset.id === catalog.defaultPaletteId),
    ).toBe(true);
    expect(catalog.presets[0]).toMatchObject({
      label: 'Чернила',
      description: 'Тёмный зал, тёплый металл',
    });
    expect(catalog.presets).toHaveLength(22);
  });

  it('persists every catalog preset and returns identical themes in all four responses', async () => {
    const { responseValue: catalog } =
      await new BookingPalettesController().palettes();
    for (const preset of catalog!.presets) {
      const selectedForm = { ...form, paletteId: preset.id };
      const page = await pages.create(
        'location',
        plainToInstance(SaveBookingPageDto, {
          ...pageInput,
          form: selectedForm,
        }),
      );
      const widget = await widgets.create(
        'location',
        plainToInstance(SaveBookingWidgetDto, {
          ...widgetInput,
          form: selectedForm,
        }),
      );
      for (const record of [page, widget]) {
        expect(record.palette).toBe(preset.id);
        for (const key of [
          'customBackground',
          'customSurface',
          'customText',
          'customMuted',
          'customAccent',
          'customAccentText',
        ]) {
          expect(record[key as keyof typeof record]).toBeNull();
        }
      }
      for (const response of responses(page, widget)) {
        expect(response.theme).toEqual(preset.theme);
        expect(JSON.stringify(response)).not.toContain('buttonLabel');
        expect(JSON.stringify(response)).not.toContain('showServiceImages');
      }
    }
  });

  it('updates pages and widgets to CUSTOM and clears custom columns when switching back', async () => {
    const customPalette = {
      background: '#FFFFFF',
      surface: '#F7F8FA',
      text: '#17202A',
      muted: '#6C7785',
      accent: '#1E6A48',
      accentText: '#FFFFFF',
    };
    for (const selectedForm of [
      { ...form, paletteId: BookingPalette.CUSTOM, customPalette },
      form,
    ]) {
      const page = await pages.update(
        'location',
        'channel',
        plainToInstance(SaveBookingPageDto, {
          ...pageInput,
          form: selectedForm,
        }),
      );
      const widget = await widgets.update(
        'location',
        'channel',
        plainToInstance(SaveBookingWidgetDto, {
          ...widgetInput,
          form: selectedForm,
        }),
      );
      for (const response of responses(page, widget)) {
        const config = 'form' in response ? response.form : response.config;
        expect(config.customPalette).toEqual(selectedForm.customPalette);
        if (selectedForm.customPalette)
          expect(response.theme).toEqual({
            ...customPalette,
            line: 'rgba(23,32,42,0.14)',
          });
      }
      for (const record of [page, widget]) {
        expect(record.customAccent).toBe(
          selectedForm.customPalette?.accent ?? null,
        );
        expect(record).not.toHaveProperty('line');
      }
    }
  });
});

function responses(page: BookingPageWithCover, widget: BookingWidget) {
  return [
    BookingPageResponseDto.fromEntity(page),
    BookingWidgetResponseDto.fromEntity(widget),
    PublicBookingPageResponseDto.from(page, location, setup),
    PublicBookingWidgetResponseDto.from(widget, location, setup),
  ];
}
