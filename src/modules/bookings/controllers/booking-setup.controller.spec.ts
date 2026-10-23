import { INestApplication, NotFoundException } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { TokenEpochRegistryService } from '../../auth/services/token-epoch-registry.service.js';
import { PublicBookingChannelsController } from '../../booking-channels/controllers/public-booking-channels.controller.js';
import { BookingPagesService } from '../../booking-channels/services/booking-pages.service.js';
import { BookingWidgetsService } from '../../booking-channels/services/booking-widgets.service.js';
import { LocationService } from '../../location/services/location.service.js';
import { ProductsService } from '../../products/services/products.service.js';
import { ServiceCatalogFacade } from '../../services/catalog/service-catalog.facade.js';
import { StaffService } from '../../staff/services/staff.service.js';
import { BookingCreateFacade } from '../booking-create.facade.js';
import { BookingsFacade } from '../bookings.facade.js';
import { BookingsExportService } from '../export/services/bookings-export.service.js';
import { BookingAccessService } from '../services/booking-access.service.js';
import { BookingClientTokenService } from '../services/booking-client-token.service.js';
import { BookingReadService } from '../services/read/booking-read.service.js';
import { BookingSetupService } from '../services/setup/booking-setup.service.js';
import { BookingMutationService } from '../services/write/booking-mutation.service.js';
import { BookingsController } from './bookings.controller.js';

describe('Public booking setup products (HTTP)', () => {
  let app: INestApplication;
  const locationId = '11111111-1111-4111-8111-111111111111';
  const widgetId = '22222222-2222-4222-8222-222222222222';
  const paths = [
    '/public/locations/' + locationId + '/booking-setup',
    '/public/booking-pages/studio',
    '/public/booking-widgets/' + widgetId,
  ];
  const products = { listForPublicCatalog: vi.fn() };
  const catalog = {
    loadForBooking: vi
      .fn()
      .mockResolvedValue({ categories: [], services: [], bundles: [] }),
  };
  const staff = { listActiveWithServices: vi.fn().mockResolvedValue([]) };
  const channel = {
    id: widgetId,
    locationId,
    palette: 'SAGE',
    headline: 'Book',
    caption: '',
    showStaff: true,
    showBranding: false,
    html: '',
    coverFile: null,
  };
  const product = {
    productId: 'product-1',
    retailPrice: new Prisma.Decimal('12.30'),
    trackInventory: true,
    product: {
      name: 'Shampoo',
      description: 'Daily care',
      categoryId: 'category-1',
      category: {
        id: 'category-1',
        name: 'Care',
        description: null,
        sortOrder: 0,
      },
      imageFile: null,
      unit: 'PIECE',
      sku: 'internal-sku',
    },
  };
  const expectedProducts = {
    categories: [{ id: 'category-1', name: 'Care', description: null }],
    items: [
      {
        productId: 'product-1',
        name: 'Shampoo',
        description: 'Daily care',
        categoryId: 'category-1',
        image: null,
        unit: 'PIECE',
        retailPrice: '12.30',
      },
    ],
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [PassportModule.register({})],
      controllers: [BookingsController, PublicBookingChannelsController],
      providers: [
        BookingsFacade,
        BookingSetupService,
        { provide: ProductsService, useValue: products },
        { provide: ServiceCatalogFacade, useValue: catalog },
        { provide: StaffService, useValue: staff },
        { provide: BookingReadService, useValue: {} },
        { provide: BookingMutationService, useValue: {} },
        { provide: BookingCreateFacade, useValue: {} },
        { provide: BookingClientTokenService, useValue: {} },
        { provide: BookingsExportService, useValue: {} },
        { provide: BookingAccessService, useValue: {} },
        { provide: TokenEpochRegistryService, useValue: {} },
        {
          provide: BookingPagesService,
          useValue: { getPublishedBySlug: vi.fn().mockResolvedValue(channel) },
        },
        {
          provide: BookingWidgetsService,
          useValue: { getPublished: vi.fn().mockResolvedValue(channel) },
        },
        {
          provide: LocationService,
          useValue: {
            findPublicProfile: vi.fn().mockResolvedValue({
              id: locationId,
              brand: { name: 'Brand', logoFile: null },
            }),
          },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    products.listForPublicCatalog.mockResolvedValue([product]);
  });

  afterAll(async () => app?.close());

  it.each(paths)(
    'includes only public product fields without authentication: %s',
    async (path) => {
      const { body } = await request(app.getHttpServer()).get(path).expect(200);
      expect(body.isSuccess).toBe(true);
      const setup = body.responseValue.setup ?? body.responseValue;
      expect(setup).toEqual({
        categories: [],
        staff: [],
        products: expectedProducts,
      });
      expect(products.listForPublicCatalog).toHaveBeenCalledWith(locationId);
      expect(catalog.loadForBooking).toHaveBeenCalledWith(locationId);
      expect(staff.listActiveWithServices).toHaveBeenCalledWith(locationId);
    },
  );

  it.each(paths)('keeps an empty catalog in the response: %s', async (path) => {
    products.listForPublicCatalog.mockResolvedValueOnce([]);
    const { body } = await request(app.getHttpServer()).get(path).expect(200);
    const setup = body.responseValue.setup ?? body.responseValue;
    expect(setup.products).toEqual({ categories: [], items: [] });
  });

  it.each(paths)(
    'propagates an unavailable location as 404: %s',
    async (path) => {
      products.listForPublicCatalog.mockRejectedValueOnce(
        new NotFoundException(),
      );
      await request(app.getHttpServer()).get(path).expect(404);
    },
  );
});
