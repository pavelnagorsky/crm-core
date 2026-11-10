import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { SwaggerModule } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { TokenEpochGuard } from '../../auth/guards/token-epoch.guard.js';
import { PermissionGuard } from '../../auth/guards/permission.guard.js';
import { TokenEpochRegistryService } from '../../auth/services/token-epoch-registry.service.js';
import { CalendarController } from '../../calendar/api/controllers/calendar.controller.js';
import { CalendarViewFacade } from '../../calendar/api/calendar-view.facade.js';
import { CalendarFacade } from '../../calendar/calendar.facade.js';
import { BookingCreateFacade } from '../booking-create.facade.js';
import { BookingsFacade } from '../bookings.facade.js';
import { LocationService } from '../../location/services/location.service.js';
import { ReviewsFacade } from '../../reviews/reviews.facade.js';
import { BookingsExportService } from '../export/services/bookings-export.service.js';
import { BookingAccessService } from '../services/booking-access.service.js';
import { BookingClientTokenService } from '../services/booking-client-token.service.js';
import { BookingsController } from './bookings.controller.js';
import { ManualCreateBookingDto } from '../dto/manual-create-booking.dto.js';
import { UpdateBookingDto } from '../dto/update-booking.dto.js';

describe('Staff assignment HTTP contract', () => {
  let app: INestApplication;
  const location = '11111111-1111-4111-8111-111111111111';
  const serviceId = '22222222-2222-4222-8222-222222222222';
  const staffId = '33333333-3333-4333-8333-333333333333';
  const slotsPath = `/locations/${location}/calendar/public/available-slots`;
  const manualSlotsPath = `/locations/${location}/calendar/available-slots`;
  const resolvePath = `/public/locations/${location}/booking-resolve`;
  const calendar = { getAvailableSlots: vi.fn(async () => []) };
  const calendarView = { getManualAvailableSlots: vi.fn(async () => []) };
  const bookings = {
    resolveBookingSelection: vi.fn(async () => ({
      availableServiceIds: [serviceId],
      availableStaff: [],
      staffByService: [],
      canAssignStaff: true,
      resolvedItems: [],
      totalListPrice: new Prisma.Decimal(0),
      totalDuration: 0,
      staffSelection: 'PER_SERVICE',
      executionMode: 'PARALLEL',
    })),
  };
  const pipe = new ValidationPipe({ transform: true, whitelist: true });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [PassportModule.register({})],
      controllers: [CalendarController, BookingsController],
      providers: [
        { provide: CalendarFacade, useValue: calendar },
        { provide: CalendarViewFacade, useValue: calendarView },
        {
          provide: BookingAccessService,
          useValue: { readStaffId: vi.fn(async () => undefined) },
        },
        { provide: BookingsFacade, useValue: bookings },
        ...[
          BookingCreateFacade,
          BookingClientTokenService,
          BookingsExportService,
          LocationService,
          ReviewsFacade,
          TokenEpochRegistryService,
        ].map((provide) => ({ provide, useValue: {} })),
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().user = { sub: 'test-user' };
          return true;
        },
      })
      .overrideGuard(TokenEpochGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(pipe);
    await app.init();
  });
  afterAll(async () => app?.close());
  beforeEach(() => vi.clearAllMocks());

  it('parses an encoded JSON query and validates nested assignment DTOs', async () => {
    await request(app.getHttpServer())
      .get(slotsPath)
      .query({
        serviceId,
        staffAssignments: JSON.stringify([{ serviceId, staffId }]),
      })
      .expect(200);
    expect(calendar.getAvailableSlots).toHaveBeenCalledWith(
      location,
      expect.objectContaining({ staffAssignments: [{ serviceId, staffId }] }),
    );
  });

  it.each([
    '{',
    'null',
    '{}',
    '[null]',
    JSON.stringify([{ serviceId: 'bad' }]),
    JSON.stringify([{ serviceId, staffId: 'bad' }]),
    JSON.stringify([{ serviceId }, { serviceId }]),
    JSON.stringify(Array.from({ length: 11 }, () => ({ serviceId }))),
    ' '.repeat(4097),
  ])('rejects malformed or unbounded query %s', async (staffAssignments) => {
    await request(app.getHttpServer())
      .get(slotsPath)
      .query({ serviceId, staffAssignments })
      .expect(400);
    expect(calendar.getAvailableSlots).not.toHaveBeenCalled();
  });

  it('rejects repeated query keys instead of relying on the Express array parser', async () => {
    await request(app.getHttpServer())
      .get(slotsPath)
      .query({ serviceId, staffAssignments: ['[]', '[]'] })
      .expect(400);
  });

  it('accepts automatic and partial body assignments and includes preview fields in the response', async () => {
    const staffAssignments = [{ serviceId, staffId: null }];
    const response = await request(app.getHttpServer())
      .post(resolvePath)
      .send({
        serviceIds: [serviceId],
        staffAssignments,
        startAt: '2026-11-10T10:00:00',
      })
      .expect(201);
    expect(response.body.responseValue).toMatchObject({
      staffSelection: 'PER_SERVICE',
      canAssignStaff: true,
      resolvedItems: [],
      totalListPrice: '0.00',
    });
    expect(bookings.resolveBookingSelection).toHaveBeenCalledWith(
      location,
      expect.objectContaining({ staffAssignments }),
    );
  });

  it('parses saved-item assignments without requiring a catalog selection', async () => {
    const assignments = [{ bookingItemId: serviceId, staffId }];
    await request(app.getHttpServer())
      .get(manualSlotsPath)
      .query({
        bookingId: location,
        from: '2026-11-10',
        to: '2026-11-11',
        itemStaffAssignments: JSON.stringify(assignments),
      })
      .expect(200);
    expect(calendarView.getManualAvailableSlots).toHaveBeenCalledWith(
      location,
      expect.objectContaining({
        bookingId: location,
        itemStaffAssignments: assignments,
      }),
      undefined,
    );
  });

  it.each(
    [
      'null',
      '[null]',
      '[[]]',
      '{}',
      '{',
      JSON.stringify([{ bookingItemId: 'bad', staffId }]),
      JSON.stringify([{ bookingItemId: serviceId }]),
      JSON.stringify([{ bookingItemId: serviceId, staffId: null }]),
      JSON.stringify([{ bookingItemId: serviceId, staffId: 'bad' }]),
      JSON.stringify([
        { bookingItemId: serviceId, staffId },
        { bookingItemId: serviceId, staffId },
      ]),
      JSON.stringify(
        Array.from({ length: 11 }, () => ({
          bookingItemId: serviceId,
          staffId,
        })),
      ),
      ' '.repeat(4097),
      ['[]', '[]'],
    ].map((itemStaffAssignments) => ({ itemStaffAssignments })),
  )(
    'rejects invalid saved-item queries: %j',
    async ({ itemStaffAssignments }) => {
      await request(app.getHttpServer())
        .get(manualSlotsPath)
        .query({
          bookingId: location,
          from: '2026-11-10',
          to: '2026-11-11',
          itemStaffAssignments,
        })
        .expect(400);
      expect(calendarView.getManualAvailableSlots).not.toHaveBeenCalled();
    },
  );

  it.each(
    [
      JSON.stringify([{ serviceId }]),
      [{ serviceId, staffId: 'bad' }],
      [{ serviceId }, { serviceId }],
    ].map((staffAssignments) => ({ staffAssignments })),
  )(
    'rejects invalid JSON body assignments %j',
    async ({ staffAssignments }) => {
      await request(app.getHttpServer())
        .post(resolvePath)
        .send({ serviceIds: [serviceId], staffAssignments })
        .expect(400);
      expect(bookings.resolveBookingSelection).not.toHaveBeenCalled();
    },
  );

  it('validates inherited create assignments and requires explicit booking item replacements on update', async () => {
    const create = await pipe.transform(
      {
        anonymous: true,
        startAt: '2026-11-10T10:00:00',
        staffAssignments: [{ serviceId, staffId }],
      },
      { type: 'body', metatype: ManualCreateBookingDto },
    );
    expect(create.staffAssignments).toEqual([{ serviceId, staffId }]);
    await expect(
      pipe.transform(
        { staffAssignments: [{ bookingItemId: serviceId, staffId: null }] },
        { type: 'body', metatype: UpdateBookingDto },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('documents a string query and object-array bodies in Swagger', () => {
    const doc = SwaggerModule.createDocument(app, {
      info: { title: 'test', version: '1' },
      openapi: '3.0.0',
    });
    const parameters =
      doc.paths['/locations/{locationId}/calendar/public/available-slots'].get!
        .parameters;
    expect(parameters).toContainEqual(
      expect.objectContaining({
        name: 'staffAssignments',
        schema: expect.objectContaining({ type: 'string' }),
      }),
    );
    expect(doc.components!.schemas!.BookingResolveRequestDto).toMatchObject({
      properties: {
        staffAssignments: {
          type: 'array',
          items: { $ref: '#/components/schemas/StaffAssignmentDto' },
        },
      },
    });
    expect(
      doc.paths['/locations/{locationId}/calendar/available-slots'].get!
        .parameters,
    ).toContainEqual(
      expect.objectContaining({
        name: 'itemStaffAssignments',
        schema: expect.objectContaining({ type: 'string' }),
      }),
    );
    expect(doc.components!.schemas!.UpdateBookingDto).toMatchObject({
      properties: {
        staffAssignments: {
          type: 'array',
          items: { $ref: '#/components/schemas/BookingItemStaffAssignmentDto' },
        },
      },
    });
  });
});
