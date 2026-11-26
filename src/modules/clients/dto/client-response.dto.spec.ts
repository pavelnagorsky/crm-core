import { Client, Prisma } from '@prisma/client';
import { ClientResponseDto } from './client-response.dto.js';

const client = (
  servicesDiscountPercent: Prisma.Decimal | null,
  productsDiscountPercent: Prisma.Decimal | null = null,
): Client => ({
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
  servicesDiscountPercent,
  productsDiscountPercent,
  createdAt: new Date('2026-11-01T00:00:00.000Z'),
  updatedAt: new Date('2026-11-01T00:00:00.000Z'),
});

describe('ClientResponseDto personal discount', () => {
  it('formats the percent and the use', () => {
    const dto = ClientResponseDto.fromEntity(
      client(new Prisma.Decimal('7.5'), new Prisma.Decimal('3')),
      {
        bookingsCount: 2,
        salesCount: 1,
        amount: new Prisma.Decimal('12.3'),
      },
    );
    expect(dto.servicesDiscountPercent).toBe('7.50');
    expect(dto.productsDiscountPercent).toBe('3.00');
    expect(dto.discountStats).toEqual({
      bookingsCount: 2,
      salesCount: 1,
      amount: '12.30',
    });
  });

  it('no discount and no use', () => {
    const dto = ClientResponseDto.fromEntity(client(null));
    expect(dto.servicesDiscountPercent).toBeNull();
    expect(dto.productsDiscountPercent).toBeNull();
    expect(dto.discountStats).toEqual({
      bookingsCount: 0,
      salesCount: 0,
      amount: '0.00',
    });
  });
});
