import { Client, Prisma } from '@prisma/client';
import { ClientResponseDto } from './client-response.dto.js';

const client = (discountPercent: Prisma.Decimal | null): Client => ({
  id: 'c1',
  brandId: 'b1',
  userId: null,
  firstName: 'Анна',
  lastName: 'Иванова',
  phone: '375291234567',
  email: null,
  birthDate: null,
  gender: null,
  notes: null,
  bannedAt: null,
  banReason: null,
  acquisitionSource: null,
  acquisitionSourceDetail: null,
  acquisitionBookingId: null,
  acquiredAt: null,
  importedAt: null,
  discountPercent,
  createdAt: new Date('2026-11-01T00:00:00.000Z'),
  updatedAt: new Date('2026-11-01T00:00:00.000Z'),
});

describe('ClientResponseDto personal discount', () => {
  it('formats the percent and the use', () => {
    const dto = ClientResponseDto.fromEntity(client(new Prisma.Decimal('7.5')), {
      bookingsCount: 2,
      amount: new Prisma.Decimal('12.3'),
    });
    expect(dto.discountPercent).toBe('7.50');
    expect(dto.discountStats).toEqual({ bookingsCount: 2, amount: '12.30' });
  });

  it('no discount and no use', () => {
    const dto = ClientResponseDto.fromEntity(client(null));
    expect(dto.discountPercent).toBeNull();
    expect(dto.discountStats).toEqual({ bookingsCount: 0, amount: '0.00' });
  });
});
