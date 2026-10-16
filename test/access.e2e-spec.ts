import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';

const url = process.env.RBAC_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

suite('Access API on isolated PostgreSQL', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let brandId: string, locationId: string, secondLocationId: string;
  let ownerId: string, managerId: string, employeeId: string, profileId: string;
  let auth: {
    resolveTokenPayload(id: string): Promise<Record<string, unknown>>;
  };
  const sign = async (id: string) =>
    new JwtService().sign(await auth.resolveTokenPayload(id), {
      secret: 'access-rbac-test-secret',
      expiresIn: '1h',
    });
  const api = () => request(app.getHttpServer());
  const value = (response: { body: { responseValue: any } }) =>
    response.body.responseValue;
  const policies = async () =>
    value(
      await api()
        .get(`/brands/${brandId}/access/policies`)
        .auth(await sign(ownerId), { type: 'bearer' })
        .expect(200),
    );
  const invite = async (issuer: string, grants: unknown[]) =>
    value(
      await api()
        .post(`/brands/${brandId}/access/invitations`)
        .auth(await sign(issuer), { type: 'bearer' })
        .send({ grants })
        .expect(201),
    );

  beforeAll(async () => {
    const parsed = new URL(url!);
    if (
      !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) ||
      !parsed.pathname.endsWith('_test')
    )
      throw new Error(
        'RBAC integration tests require an isolated local *_test database',
      );
    process.env.DATABASE_URL = url;
    process.env.ACCESS_TOKEN_SECRET = 'access-rbac-test-secret';
    process.env.REFRESH_TOKEN_SECRET = 'refresh-rbac-test-secret';
    process.env.EMAIL_TOKEN_SECRET = 'email-rbac-test-secret';
    process.env.BOOKING_CLIENT_TOKEN_SECRET = 'client-rbac-test-secret';
    process.env.NOTIFICATIONS_ENABLED = 'false';
    process.env.DOMAIN = 'http://localhost:3001';
    const { AppModule } = await import('../dist/app.module.js');
    const { DatabaseService } =
      await import('../dist/database/database.service.js');
    const { GlobalExceptionFilter } =
      await import('../dist/shared/filters/exception.filter.js');
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.listen(0, '127.0.0.1');
    const openApi = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('RBAC test').build(),
    );
    expect(openApi.paths['/users/me/access']).toBeDefined();
    expect(openApi.paths['/brands/{brandId}/access/invitations']).toBeDefined();
    db = app.get(DatabaseService);
    const { AuthService } =
      await import('../dist/modules/auth/auth.service.js');
    auth = app.get(AuthService);
  }, 30000);

  beforeEach(async () => {
    [
      brandId,
      locationId,
      secondLocationId,
      ownerId,
      managerId,
      employeeId,
      profileId,
    ] = Array.from({ length: 7 }, () => randomUUID());
    await db.user.createMany({
      data: [ownerId, managerId, employeeId].map((id) => ({
        id,
        firstName: id,
      })),
    });
    await db.brand.create({
      data: {
        id: brandId,
        name: 'RBAC test',
        brandMemberships: { create: { userId: ownerId, role: 'OWNER' } },
        accessState: { create: {} },
        locations: {
          create: [locationId, secondLocationId].map((id) => ({
            id,
            name: id,
            countryCode: 'BY',
            currency: 'BYN',
            timezone: 'Europe/Minsk',
          })),
        },
      },
    });
    await db.locationMembership.createMany({
      data: [
        { userId: managerId, locationId, role: 'MANAGER' },
        { userId: employeeId, locationId, role: 'STAFF' },
      ],
    });
    await db.staff.create({
      data: { id: profileId, locationId, userId: employeeId, name: 'Employee' },
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  it('uses current defaults and keeps location navigation inside the assigned scope', async () => {
    const employeeToken = await sign(employeeId);
    await api()
      .get(`/brands/${brandId}/clients?isExport=true`)
      .auth(employeeToken, { type: 'bearer' })
      .expect(403);
    await api()
      .get(`/brands/${brandId}/clients`)
      .auth(employeeToken, { type: 'bearer' })
      .expect(200);
    await api()
      .get(`/brands/${brandId}/products`)
      .auth(employeeToken, { type: 'bearer' })
      .expect(200);
    await api()
      .get(`/locations/${locationId}/payroll/periods`)
      .auth(employeeToken, { type: 'bearer' })
      .expect(403);
    await api()
      .get(`/locations/${secondLocationId}/orders`)
      .auth(employeeToken, { type: 'bearer' })
      .expect(403);
    const locations = value(
      await api()
        .get(`/brands/${brandId}/locations`)
        .auth(employeeToken, { type: 'bearer' })
        .expect(200),
    );
    expect(locations.map((row: { id: string }) => row.id)).toEqual([
      locationId,
    ]);
    await api()
      .put(`/locations/${locationId}`)
      .auth(await sign(managerId), { type: 'bearer' })
      .send({ name: 'No' })
      .expect(403);
    const brands = value(
      await api()
        .get('/brands')
        .auth(employeeToken, { type: 'bearer' })
        .expect(200),
    );
    expect(JSON.stringify(brands)).toContain(brandId);
  });

  it('authorizes ordinary API requests from JWT without querying users, memberships or policies', async () => {
    const token = await sign(employeeId);
    const { AccessService } =
      await import('../dist/modules/access/access.service.js');
    const { UserService } =
      await import('../dist/modules/user/user.service.js');
    const permissions = vi.spyOn(app.get(AccessService), 'resolvePermissions');
    const user = vi.spyOn(app.get(UserService), 'findById');
    try {
      await api()
        .get(`/locations/${locationId}/orders`)
        .auth(token, { type: 'bearer' })
        .expect(200);
      await api()
        .get(`/brands/${brandId}/clients`)
        .auth(token, { type: 'bearer' })
        .expect(200);
      await api()
        .get(`/locations/${locationId}/payroll/periods`)
        .auth(token, { type: 'bearer' })
        .expect(403);
      expect(permissions).not.toHaveBeenCalled();
      expect(user).not.toHaveBeenCalled();
    } finally {
      permissions.mockRestore();
      user.mockRestore();
    }
  });

  it('combines brand manager and local owner and observes revocation with the same JWT', async () => {
    await db.brandMembership.create({
      data: { brandId, userId: managerId, role: 'MANAGER' },
    });
    await db.locationMembership.update({
      where: { userId_locationId: { userId: managerId, locationId } },
      data: { role: 'OWNER' },
    });
    const jwt = await sign(managerId);
    const access = value(
      await api()
        .get('/users/me/access')
        .auth(jwt, { type: 'bearer' })
        .expect(200),
    );
    expect(
      access.scopes.find(
        (scope: { locationId: string }) => scope.locationId === locationId,
      ).permissions,
    ).toContain('location.settings.manage');
    expect(
      access.scopes.find(
        (scope: { locationId: string }) =>
          scope.locationId === secondLocationId,
      ).permissions,
    ).not.toContain('location.settings.manage');
    const membership = await db.brandMembership.findUniqueOrThrow({
      where: { userId_brandId: { userId: managerId, brandId } },
    });
    await api()
      .delete('/brands/' + brandId + '/access/memberships/' + membership.id)
      .auth(await sign(ownerId), { type: 'bearer' })
      .set('If-Match', String((await policies()).version))
      .expect(204);
    await api()
      .get(`/locations/${secondLocationId}/orders`)
      .auth(jwt, { type: 'bearer' })
      .expect(409);
    await api()
      .get(`/locations/${locationId}/orders`)
      .auth(await sign(managerId), { type: 'bearer' })
      .expect(200);
  });

  it('changes permissions immediately and rejects forbidden role overrides atomically', async () => {
    const jwt = await sign(employeeId);
    let policy = await policies();
    await api()
      .patch(`/brands/${brandId}/access/policies`)
      .auth(await sign(ownerId), { type: 'bearer' })
      .send({
        expectedVersion: policy.version,
        changes: [{ role: 'STAFF', permission: 'order.return', value: 'DENY' }],
      })
      .expect(200);
    await api()
      .post(`/locations/${locationId}/orders/${randomUUID()}/returns`)
      .auth(jwt, { type: 'bearer' })
      .send({})
      .expect(409);
    await api()
      .post(`/locations/${locationId}/orders/${randomUUID()}/returns`)
      .auth(await sign(employeeId), { type: 'bearer' })
      .send({})
      .expect(403);
    policy = await policies();
    await api()
      .patch(`/brands/${brandId}/access/policies`)
      .auth(await sign(ownerId), { type: 'bearer' })
      .send({
        expectedVersion: policy.version,
        changes: [
          { role: 'STAFF', permission: 'order.return', value: 'ALLOW' },
          { role: 'STAFF', permission: 'payroll.read', value: 'ALLOW' },
        ],
      })
      .expect(400);
    expect(
      (
        await db.brandPermissionOverride.findFirstOrThrow({
          where: { brandId, permission: 'order.return' },
        })
      ).allowed,
    ).toBe(false);
    await api()
      .patch(`/brands/${brandId}/access/policies`)
      .auth(await sign(managerId), { type: 'bearer' })
      .send({
        expectedVersion: policy.version,
        changes: [
          { role: 'STAFF', permission: 'order.return', value: 'ALLOW' },
        ],
      })
      .expect(403);
  });

  it('invites a person before registration, accepts once, and never exposes stored token hashes', async () => {
    const staff = await db.staff.create({
      data: { locationId, name: 'New colleague' },
    });
    const link = await invite(managerId, [
      { scope: 'LOCATION', locationId, role: 'STAFF', staffId: staff.id },
    ]);
    expect(link.token).toHaveLength(64);
    expect(JSON.stringify(link)).not.toContain('tokenHash');
    expect(
      (
        await db.accessInvitation.findUniqueOrThrow({
          where: { id: link.invitation.id },
        })
      ).tokenHash,
    ).not.toBe(link.token);
    const email = `${randomUUID()}@example.com`;
    await api()
      .post('/auth/register')
      .send({ firstName: 'New', email, password: 'StrongPassword123' })
      .expect(201);
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    expect(await db.brandMembership.count({ where: { userId: user.id } })).toBe(
      0,
    );
    const accepted = await Promise.all(
      [1, 2].map(async () =>
        api()
          .post('/access/invitations/accept')
          .auth(await sign(user.id), { type: 'bearer' })
          .send({ token: link.token }),
      ),
    );
    expect(accepted.map((response) => response.status)).toContain(200);
    expect(
      accepted.every((response) => [200, 409].includes(response.status)),
    ).toBe(true);
    expect(
      await db.locationMembership.count({
        where: { userId: user.id, locationId },
      }),
    ).toBe(1);
    expect(
      (await db.staff.findUniqueOrThrow({ where: { id: staff.id } })).userId,
    ).toBe(user.id);
    await api()
      .post('/access/invitations/accept')
      .auth(await sign(employeeId), { type: 'bearer' })
      .send({ token: link.token })
      .expect(410);
    await db.locationMembership.deleteMany({ where: { userId: user.id } });
    await api()
      .post('/access/invitations/accept')
      .auth(await sign(user.id), { type: 'bearer' })
      .send({ token: link.token })
      .expect(200);
    expect(
      await db.locationMembership.count({ where: { userId: user.id } }),
    ).toBe(0);
  });

  it('does not let manager invite managers or grant another location, and rejects a revoked issuer', async () => {
    await api()
      .post(`/brands/${brandId}/access/invitations`)
      .auth(await sign(managerId), { type: 'bearer' })
      .send({ grants: [{ scope: 'LOCATION', locationId, role: 'MANAGER' }] })
      .expect(403);
    const otherStaff = await db.staff.create({
      data: { locationId: secondLocationId, name: 'Other' },
    });
    await api()
      .post(`/brands/${brandId}/access/invitations`)
      .auth(await sign(managerId), { type: 'bearer' })
      .send({
        grants: [
          {
            scope: 'LOCATION',
            locationId: secondLocationId,
            role: 'STAFF',
            staffId: otherStaff.id,
          },
        ],
      })
      .expect(403);
    const staff = await db.staff.create({
      data: { locationId, name: 'Invite' },
    });
    const link = await invite(managerId, [
      { scope: 'LOCATION', locationId, role: 'STAFF', staffId: staff.id },
    ]);
    await db.locationMembership.deleteMany({ where: { userId: managerId } });
    const user = await db.user.create({ data: {} });
    await api()
      .post('/access/invitations/accept')
      .auth(await sign(user.id), { type: 'bearer' })
      .send({ token: link.token })
      .expect(403);
    expect(
      await db.locationMembership.count({ where: { userId: user.id } }),
    ).toBe(0);
  });

  it('serializes concurrent owner removal and protects the final owner', async () => {
    const coowner = await db.user.create({ data: {} });
    const first = await db.brandMembership.findUniqueOrThrow({
      where: { userId_brandId: { userId: ownerId, brandId } },
    });
    const second = await db.brandMembership.create({
      data: { brandId, userId: coowner.id, role: 'OWNER' },
    });
    const policy = await policies();
    const results = await Promise.all(
      [
        [ownerId, first.id],
        [coowner.id, second.id],
      ].map(async ([userId, id]) =>
        api()
          .delete(`/brands/${brandId}/access/memberships/${id}`)
          .auth(await sign(userId), { type: 'bearer' })
          .set('If-Match', String(policy.version)),
      ),
    );
    expect(results.map((response) => response.status).sort()).toEqual([
      204, 409,
    ]);
    const survivor = await db.brandMembership.findFirstOrThrow({
      where: { brandId, role: 'OWNER' },
    });
    const version = (
      await db.accessState.findUniqueOrThrow({ where: { brandId } })
    ).revision;
    const result = await api()
      .delete(`/brands/${brandId}/access/memberships/${survivor.id}`)
      .auth(await sign(survivor.userId), { type: 'bearer' })
      .set('If-Match', String(version))
      .expect(409);
    expect(JSON.stringify(result.body)).toContain('ACCESS_LAST_OWNER');
  });

  it('rolls back every grant when one staff profile belongs to another account', async () => {
    const staff = await db.staff.create({
      data: { locationId: secondLocationId, name: 'New profile' },
    });
    const link = await invite(ownerId, [
      {
        scope: 'LOCATION',
        locationId: secondLocationId,
        role: 'STAFF',
        staffId: staff.id,
      },
      { scope: 'LOCATION', locationId, role: 'STAFF', staffId: profileId },
    ]);
    const user = await db.user.create({ data: {} });
    await api()
      .post('/access/invitations/accept')
      .auth(await sign(user.id), { type: 'bearer' })
      .send({ token: link.token })
      .expect(409);
    expect(
      await db.locationMembership.count({ where: { userId: user.id } }),
    ).toBe(0);
    expect(
      (await db.staff.findUniqueOrThrow({ where: { id: staff.id } })).userId,
    ).toBeNull();
  });

  it('prevents changes to another platform administrator and records owner replacement', async () => {
    const admin = await db.user.create({ data: { role: 'ADMIN' } });
    const another = await db.user.create({ data: { role: 'ADMIN' } });
    const membership = await db.brandMembership.create({
      data: { brandId, userId: another.id, role: 'OWNER' },
    });
    const version = (await policies()).version;
    await api()
      .delete(`/brands/${brandId}/access/memberships/${membership.id}`)
      .auth(await sign(admin.id), { type: 'bearer' })
      .set('If-Match', String(version))
      .expect(403);
    await api()
      .post(`/admin/brands/${brandId}/owner-replacement`)
      .auth(await sign(admin.id), { type: 'bearer' })
      .send({
        previousUserId: ownerId,
        newUserId: managerId,
        reason: 'Registration correction',
      })
      .expect(201);
    expect(
      (
        await db.brandMembership.findUniqueOrThrow({
          where: { userId_brandId: { userId: managerId, brandId } },
        })
      ).role,
    ).toBe('OWNER');
    expect(
      await db.accessAudit.count({
        where: { brandId, action: 'OWNER_REPLACED' },
      }),
    ).toBe(1);
  });

  it('revokes staff access on deactivation without deleting the account', async () => {
    await api()
      .patch(`/locations/${locationId}/staff/${profileId}/status`)
      .auth(await sign(managerId), { type: 'bearer' })
      .send({ status: 'INACTIVE' })
      .expect(204);
    await api()
      .get(`/locations/${locationId}/orders`)
      .auth(await sign(employeeId), { type: 'bearer' })
      .expect(403);
    expect(
      await db.user.findUnique({ where: { id: employeeId } }),
    ).not.toBeNull();
  });

  it('releases a revoked staff profile for another invitation', async () => {
    const membership = await db.locationMembership.findUniqueOrThrow({
      where: { userId_locationId: { userId: employeeId, locationId } },
    });
    await api()
      .delete(`/locations/${locationId}/access/memberships/${membership.id}`)
      .auth(await sign(managerId), { type: 'bearer' })
      .set('If-Match', String((await policies()).version))
      .expect(204);
    expect(
      (await db.staff.findUniqueOrThrow({ where: { id: profileId } })).userId,
    ).toBeNull();
    const link = await invite(managerId, [
      { scope: 'LOCATION', locationId, role: 'STAFF', staffId: profileId },
    ]);
    const user = await db.user.create({ data: {} });
    await api()
      .post('/access/invitations/accept')
      .auth(await sign(user.id), { type: 'bearer' })
      .send({ token: link.token })
      .expect(200);
    expect(
      (await db.staff.findUniqueOrThrow({ where: { id: profileId } })).userId,
    ).toBe(user.id);
  });

  it('returns an entire mixed-seller sale and independently protects price changes and confirmation', async () => {
    const products = await Promise.all(
      [1, 2].map((index) =>
        db.product.create({
          data: {
            brandId,
            name: `Product ${index}`,
            locations: {
              create: { locationId, retailPrice: '10', trackInventory: false },
            },
          },
        }),
      ),
    );
    const colleague = await db.staff.create({
      data: { locationId, name: 'Another seller' },
    });
    const items = products.map((product, index) => ({
      productId: product.id,
      quantity: '1',
      sellerStaffId: index ? colleague.id : profileId,
    }));
    const created = value(
      await api()
        .post(`/locations/${locationId}/orders`)
        .auth(await sign(employeeId), { type: 'bearer' })
        .send({ items, confirmImmediately: true, idempotencyKey: randomUUID() })
        .expect(201),
    );
    const rows = await db.orderItem.findMany({
      where: { orderId: created.id },
    });
    await api()
      .post(`/locations/${locationId}/orders/${created.id}/returns`)
      .auth(await sign(employeeId), { type: 'bearer' })
      .send({
        idempotencyKey: randomUUID(),
        reason: 'Customer changed mind',
        items: rows.map((row) => ({ orderItemId: row.id, quantity: '1' })),
      })
      .expect(201);
    await api()
      .post(`/locations/${locationId}/orders`)
      .auth(await sign(employeeId), { type: 'bearer' })
      .send({ items: [{ ...items[0], customUnitPrice: '5' }] })
      .expect(403);
    const draft = value(
      await api()
        .post(`/locations/${locationId}/orders`)
        .auth(await sign(managerId), { type: 'bearer' })
        .send({ items: [{ ...items[0], customUnitPrice: '5' }] })
        .expect(201),
    );
    const saved = await db.order.findUniqueOrThrow({
      where: { id: draft.id },
      include: { items: true },
    });
    await api()
      .put(`/locations/${locationId}/orders/${draft.id}`)
      .auth(await sign(employeeId), { type: 'bearer' })
      .send({
        version: saved.version,
        items: [{ ...items[0], id: saved.items[0].id }],
      })
      .expect(200);
    expect(
      (
        await db.orderItem.findFirstOrThrow({ where: { orderId: draft.id } })
      ).customUnitPrice?.toString(),
    ).toBe('5');
    await api()
      .patch(`/brands/${brandId}/access/policies`)
      .auth(await sign(ownerId), { type: 'bearer' })
      .send({
        expectedVersion: (await policies()).version,
        changes: [
          { role: 'STAFF', permission: 'order.confirm', value: 'DENY' },
        ],
      })
      .expect(200);
    await api()
      .post(`/locations/${locationId}/orders`)
      .auth(await sign(employeeId), { type: 'bearer' })
      .send({ items, confirmImmediately: true, idempotencyKey: randomUUID() })
      .expect(403);
  });

  it('protects completed booking reversals while allowing ordinary cancellation with a row lock', async () => {
    const makeBooking = (status: 'COMPLETED' | 'CONFIRMED') =>
      db.booking.create({
        data: {
          locationId,
          source: 'MANUAL',
          status,
          startAt: new Date('2026-12-10T10:00:00Z'),
          endAt: new Date('2026-12-10T11:00:00Z'),
          clientFirstName: 'Test',
          clientLastName: 'Client',
        },
      });
    const completed = await makeBooking('COMPLETED');
    const confirmed = await makeBooking('CONFIRMED');
    await api()
      .patch(`/brands/${brandId}/access/policies`)
      .auth(await sign(ownerId), { type: 'bearer' })
      .send({
        expectedVersion: (await policies()).version,
        changes: [{ role: 'STAFF', permission: 'order.return', value: 'DENY' }],
      })
      .expect(200);
    await api()
      .post(`/locations/${locationId}/bookings/${completed.id}/cancel`)
      .auth(await sign(employeeId), { type: 'bearer' })
      .send({})
      .expect(403);
    await api()
      .delete(`/locations/${locationId}/bookings/${completed.id}`)
      .auth(await sign(employeeId), { type: 'bearer' })
      .expect(403);
    expect(
      (await db.booking.findUniqueOrThrow({ where: { id: completed.id } }))
        .status,
    ).toBe('COMPLETED');
    await api()
      .post(`/locations/${locationId}/bookings/${confirmed.id}/cancel`)
      .auth(await sign(employeeId), { type: 'bearer' })
      .send({})
      .expect(201);
    expect(
      (await db.booking.findUniqueOrThrow({ where: { id: confirmed.id } }))
        .status,
    ).toBe('CANCELLED');
  });

  it('requires inventory access to both locations for transfer creation, editing and voiding', async () => {
    const product = await db.product.create({
      data: { brandId, name: 'Transfer product', unit: 'PIECE' },
    });
    await db.productLocation.createMany({
      data: [locationId, secondLocationId].map((id) => ({
        productId: product.id,
        locationId: id,
        retailPrice: 10,
        trackInventory: true,
      })),
    });
    const input = {
      type: 'TRANSFER',
      destinationLocationId: secondLocationId,
      occurredAt: new Date(Date.now() - 60000).toISOString(),
      items: [{ productId: product.id, quantity: '1' }],
    };
    await api()
      .post('/locations/' + locationId + '/inventory/documents')
      .auth(await sign(managerId), { type: 'bearer' })
      .send(input)
      .expect(403);
    const transfer = value(
      await api()
        .post('/locations/' + locationId + '/inventory/documents')
        .auth(await sign(ownerId), { type: 'bearer' })
        .send(input)
        .expect(201),
    );
    await api()
      .put('/locations/' + locationId + '/inventory/documents/' + transfer.id)
      .auth(await sign(managerId), { type: 'bearer' })
      .send({
        ...input,
        type: 'RECEIPT',
        destinationLocationId: null,
        items: [{ productId: product.id, quantity: '1', unitCost: '2' }],
      })
      .expect(403);
    await api()
      .patch(
        '/locations/' +
          locationId +
          '/inventory/documents/' +
          transfer.id +
          '/status',
      )
      .auth(await sign(managerId), { type: 'bearer' })
      .send({ status: 'VOIDED' })
      .expect(403);
    await api()
      .patch(
        '/locations/' +
          locationId +
          '/inventory/documents/' +
          transfer.id +
          '/status',
      )
      .auth(await sign(ownerId), { type: 'bearer' })
      .send({ status: 'VOIDED' })
      .expect(200);
  });

  it('rejects cancellation when a booking completes after the API checked its state', async () => {
    const booking = await db.booking.create({
      data: {
        locationId,
        source: 'MANUAL',
        status: 'CONFIRMED',
        startAt: new Date('2026-12-10T10:00:00Z'),
        endAt: new Date('2026-12-10T11:00:00Z'),
        clientFirstName: 'Concurrent',
        clientLastName: 'Test',
      },
    });
    const { BookingsService } =
      await import('../dist/modules/bookings/bookings.service.js');
    const bookings = app.get(BookingsService);
    const read = bookings.findByIdInLocation.bind(bookings);
    const spy = vi
      .spyOn(bookings, 'findByIdInLocation')
      .mockImplementationOnce(async (...args) => {
        const snapshot = await read(...args);
        await db.booking.update({
          where: { id: booking.id },
          data: { status: 'COMPLETED' },
        });
        return snapshot;
      });
    try {
      const response = await api()
        .post(
          '/locations/' + locationId + '/bookings/' + booking.id + '/cancel',
        )
        .auth(await sign(employeeId), { type: 'bearer' })
        .send({})
        .expect(409);
      expect(JSON.stringify(response.body)).toContain(
        'BOOKING_CONCURRENT_UPDATE',
      );
      expect(
        (await db.booking.findUniqueOrThrow({ where: { id: booking.id } }))
          .status,
      ).toBe('COMPLETED');
    } finally {
      spy.mockRestore();
    }
  });

  it('invalidates the previous invitation token on reissue', async () => {
    const staff = await db.staff.create({
      data: { locationId, name: 'Invite' },
    });
    const link = await invite(managerId, [
      { scope: 'LOCATION', locationId, role: 'STAFF', staffId: staff.id },
    ]);
    const replacement = value(
      await api()
        .post(
          `/brands/${brandId}/access/invitations/${link.invitation.id}/reissue`,
        )
        .auth(await sign(managerId), { type: 'bearer' })
        .expect(201),
    );
    const user = await db.user.create({ data: {} });
    await api()
      .post('/access/invitations/accept')
      .auth(await sign(user.id), { type: 'bearer' })
      .send({ token: link.token })
      .expect(404);
    await api()
      .post('/access/invitations/accept')
      .auth(await sign(user.id), { type: 'bearer' })
      .send({ token: replacement.token })
      .expect(200);
  });

  it('prevents deleting an attached brand logo through the personal file endpoint', async () => {
    const file = await db.file.create({
      data: {
        userId: employeeId,
        url: 'https://example.com/test.png',
        storageKey: `users/${employeeId}/files/test-only.png`,
        fileName: 'test.png',
        mimeType: 'image/png',
        fileSizeBytes: 1,
      },
    });
    await db.brand.update({
      where: { id: brandId },
      data: { logoFileId: file.id },
    });
    await api()
      .delete(`/users/me/files/${file.id}`)
      .auth(await sign(employeeId), { type: 'bearer' })
      .expect(409);
    expect(await db.file.findUnique({ where: { id: file.id } })).not.toBeNull();
  });
});
