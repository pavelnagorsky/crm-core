import { OmitType } from '@nestjs/swagger';
import { EmailSearchRequestDto } from './email-search-request.dto.js';

/** The list filters without paging: what a bulk action applies to. */
export class EmailFilterDto extends OmitType(EmailSearchRequestDto, [
  'page',
  'pageSize',
  'orderBy',
  'orderDirection',
  'isExport',
] as const) {}
