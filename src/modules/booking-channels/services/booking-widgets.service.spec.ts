import { BookingWidget } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { AuditActorRole } from '../../audit/enums/audit-actor-role.enum.js';
import { SaveBookingWidgetDto } from '../dto/save-booking-widget.dto.js';
import { BookingWidgetResponseDto } from '../dto/booking-widget-response.dto.js';
import { PublicBookingWidgetDetailsDto } from '../dto/public-booking-widget-details.dto.js';
import { DEFAULT_BOOKING_WIDGET_BUTTON_APPEARANCE } from '../constants/booking-widget-button.constants.js';
import { BookingWidgetsService } from './booking-widgets.service.js';

const actor = { id: 'owner', name: 'Owner', role: AuditActorRole.OWNER };
const settings = {
  title: ' Widget ',
  status: 'PUBLISHED',
  placement: 'DIALOG',
  trigger: 'FLOATING_BUTTON',
  buttonPosition: 'BOTTOM_LEFT',
  buttonAppearance: {
    ...DEFAULT_BOOKING_WIDGET_BUTTON_APPEARANCE,
    text: 'Open',
    variant: 'OUTLINE',
    format: 'TEXT',
    radius: 'SMALL',
    size: 'LARGE',
    icon: 'HEART',
    color: '#123456',
    textColor: '#FFFFFF',
    shadow: false,
    fullWidth: true,
    mobileIconOnly: false,
    offset: 48,
  },
  form: {
    paletteId: 'INK',
    customPalette: null,
    headline: ' Booking ',
    caption: ' Caption ',
    showStaff: false,
    showBranding: false,
  },
  gtmId: 'GTM-TEST',
  yandexMetrikaId: '123',
};

function fixture() {
  let saved: BookingWidget | undefined;
  const repo = {
    findFirst: vi
      .fn()
      .mockImplementation(async ({ where }) => (where.id ? saved : null)),
    create: vi.fn().mockImplementation(
      async ({ data }) =>
        (saved = {
          id: 'widget',
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        }),
    ),
    update: vi
      .fn()
      .mockImplementation(async ({ data }) => (saved = { ...saved, ...data })),
  };
  const publish = { assertTransition: vi.fn() };
  const events = { emit: vi.fn() };
  const service = new BookingWidgetsService(
    { bookingWidget: repo } as never,
    publish as never,
    events as never,
  );
  const dto = (input = settings) =>
    plainToInstance(SaveBookingWidgetDto, input);
  return { service, repo, publish, events, dto };
}

describe('booking widget persistence', () => {
  it('round trips all settings through create, update, reopen, list mapping and public details', async () => {
    const { service, publish, dto } = fixture();
    const created = await service.create('location', dto(), actor);
    expect(publish.assertTransition).toHaveBeenCalledExactlyOnceWith(
      'location',
      'DRAFT',
      'PUBLISHED',
    );
    expect(created.publishedAt).toBeInstanceOf(Date);
    const expected = {
      ...settings,
      title: 'Widget',
      form: { ...settings.form, headline: 'Booking', caption: 'Caption' },
    };
    expect(BookingWidgetResponseDto.fromEntity(created)).toMatchObject(
      expected,
    );
    publish.assertTransition.mockClear();
    for (const [placement, trigger] of [
      ['INLINE', 'FLOATING_BUTTON'],
      ['SIDEBAR', 'INLINE_BUTTON'],
      ['DIALOG', 'FLOATING_BUTTON'],
    ]) {
      await service.update(
        'location',
        'widget',
        dto({ ...settings, placement, trigger }),
        actor,
      );
      const reopened = await service.findInLocation('location', 'widget');
      expect(BookingWidgetResponseDto.fromEntity(reopened)).toMatchObject({
        ...expected,
        placement,
        trigger: placement === 'INLINE' ? 'INLINE_BUTTON' : trigger,
      });
      expect(
        PublicBookingWidgetDetailsDto.from(reopened).buttonAppearance,
      ).toEqual(settings.buttonAppearance);
      expect(reopened.publishedAt).toEqual(created.publishedAt);
    }
    expect(publish.assertTransition).not.toHaveBeenCalled();
  });

  it('does not save settings or emit an audit event when publication fails', async () => {
    const { service, repo, publish, events, dto } = fixture();
    await service.create(
      'location',
      dto({ ...settings, status: 'DRAFT' }),
      actor,
    );
    events.emit.mockClear();
    publish.assertTransition.mockRejectedValue(new Error('Closed'));
    await expect(
      service.update('location', 'widget', dto(), actor),
    ).rejects.toThrow('Closed');
    expect(repo.update).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
    await expect(service.create('location', dto(), actor)).rejects.toThrow(
      'Closed',
    );
    expect(repo.create).toHaveBeenCalledTimes(1);
  });

  it('clears publishedAt when saving as a draft', async () => {
    const { service, dto } = fixture();
    await service.create('location', dto(), actor);
    const saved = await service.update(
      'location',
      'widget',
      dto({ ...settings, status: 'DRAFT' }),
      actor,
    );
    expect(saved.status).toBe('DRAFT');
    expect(saved.publishedAt).toBeNull();
  });

  it('returns the same full defaults for old widgets in admin and public responses', () => {
    const legacy = {
      palette: 'INK',
      buttonAppearance: null,
      placement: 'INLINE',
      trigger: 'FLOATING_BUTTON',
    } as unknown as BookingWidget;
    for (const dto of [
      BookingWidgetResponseDto.fromEntity(legacy),
      PublicBookingWidgetDetailsDto.from(legacy),
    ]) {
      expect(dto.buttonAppearance).toEqual(
        DEFAULT_BOOKING_WIDGET_BUTTON_APPEARANCE,
      );
      expect(dto.buttonAppearance.text).toBe('Записаться');
      expect(dto.trigger).toBe('INLINE_BUTTON');
      expect(dto).not.toHaveProperty('allowedDomains');
    }
  });
});
