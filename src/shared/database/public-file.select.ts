import { Prisma } from '@prisma/client';

export const PUBLIC_FILE_SELECT = {
  id: true,
  fileName: true,
  url: true,
} satisfies Prisma.FileSelect;
