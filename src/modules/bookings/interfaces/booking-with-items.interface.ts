import { Prisma } from '@prisma/client';

export type BookingWithItems = Prisma.BookingGetPayload<{
  include: {
    items: {
      orderBy: { sortOrder: 'asc' };
    };
  };
}>;
