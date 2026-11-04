import { BookingWidgetsController } from '../controllers/booking-widgets.controller.js';
import { BookingWidgetsService } from './booking-widgets.service.js';

function fixture() {
  const retained = Array.from({ length: 10 }, (_, index) => ({
    id: 20 - index,
  }));
  const history = {
    create: vi.fn(),
    findMany: vi.fn().mockResolvedValue(retained),
    deleteMany: vi.fn(),
  };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'widget' }]),
    bookingWidgetInitialization: history,
  };
  const db = {
    $transaction: vi.fn().mockImplementation(async (run) => run(tx)),
    bookingWidget: {
      findFirst: vi.fn().mockResolvedValue({ id: 'widget' }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    bookingWidgetInitialization: history,
  };
  const service = new BookingWidgetsService(
    db as never,
    {} as never,
    {} as never,
  );
  return { service, db, tx, history, retained };
}

describe('Widget initialization history', () => {
  it('locks the widget before inserting and removes everything except its ten newest calls', async () => {
    const { service, db, tx, history, retained } = fixture();
    await service.recordInitialization(
      'widget',
      'https://site.example/page?q=1#form',
    );
    expect(db.$transaction).toHaveBeenCalledOnce();
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      history.create.mock.invocationCallOrder[0],
    );
    expect(history.create).toHaveBeenCalledWith({
      data: {
        widgetId: 'widget',
        url: 'https://site.example/page?q=1#form',
        createdAt: expect.any(Date),
      },
    });
    expect(history.findMany).toHaveBeenCalledWith({
      where: { widgetId: 'widget' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 10,
      select: { id: true },
    });
    expect(history.deleteMany).toHaveBeenCalledWith({
      where: {
        widgetId: 'widget',
        id: { notIn: retained.map((item) => item.id) },
      },
    });
  });

  it('skips recording when the widget was deleted before obtaining the lock', async () => {
    const { service, tx, history } = fixture();
    tx.$queryRaw.mockResolvedValue([]);
    await service.recordInitialization('widget', null);
    expect(history.create).not.toHaveBeenCalled();
    expect(history.deleteMany).not.toHaveBeenCalled();
  });

  it('loads history in the location-scoped list query without per-widget reads', async () => {
    const { service, db, history } = fixture();
    await service.list('location');
    expect(db.bookingWidget.findMany).toHaveBeenCalledExactlyOnceWith({
      where: expect.objectContaining({
        locationId: 'location',
        location: expect.any(Object),
      }),
      orderBy: { updatedAt: 'desc' },
      include: {
        initializationHistory: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        },
      },
    });
    expect(history.findMany).not.toHaveBeenCalled();
  });

  it('returns history only in the list, omitting internal fields and leaving the ID response unchanged', async () => {
    const { service, db } = fixture();
    const createdAt = new Date('2026-11-04T10:00:00Z');
    const record = {
      id: 'widget',
      locationId: 'location',
      palette: 'INK',
      initializationHistory: [
        { id: 1, widgetId: 'widget', createdAt, url: 'https://site.example/' },
      ],
    };
    db.bookingWidget.findMany.mockResolvedValue([record] as never);
    db.bookingWidget.findFirst.mockResolvedValue(record);
    const controller = new BookingWidgetsController(service, {
      forWidgets: vi.fn().mockResolvedValue(new Map()),
    } as never);
    const response = await controller.list('location');
    expect(response.responseValue?.[0].initializationHistory).toEqual([
      { createdAt, url: 'https://site.example/' },
    ]);
    const detail = await controller.findById('location', 'widget');
    expect(detail.responseValue).not.toHaveProperty('initializationHistory');
    expect(db.bookingWidget.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({ locationId: 'location', id: 'widget' }),
    });
    expect(BookingWidgetsController.prototype).not.toHaveProperty(
      'getInitializationHistory',
    );
  });
});
