import { Prisma } from '@prisma/client';

export type ReviewWithStaff = Prisma.ReviewGetPayload<{
  include: { staff: true };
}>;
