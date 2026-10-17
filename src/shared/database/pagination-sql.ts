import { Prisma } from '@prisma/client';
import { PaginationRequestDto } from '../dto/pagination-request.dto.js';

export function paginationSql(
  page: Pick<PaginationRequestDto, 'page' | 'pageSize' | 'isExport'>,
): Prisma.Sql {
  return page.isExport
    ? Prisma.empty
    : Prisma.sql`LIMIT ${page.pageSize} OFFSET ${(page.page - 1) * page.pageSize}`;
}
