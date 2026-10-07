import { Prisma } from '@prisma/client';

export type OrderWithItems = Prisma.OrderGetPayload<{
  include: { items: true };
}>;
