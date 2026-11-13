import { OmitType } from '@nestjs/swagger';
import { ReviewSearchRequestDto } from '../../dto/review-search-request.dto.js';

/** The review table filters and order, without pagination. */
export class ReviewExportRequestDto extends OmitType(ReviewSearchRequestDto, [
  'page',
  'pageSize',
  'isExport',
] as const) {}
