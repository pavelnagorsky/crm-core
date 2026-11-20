import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../exceptions/app.exception.js';
import { ErrorCode } from '../../validation/error-codes.enum.js';
import { TrafficSource } from '../enums/traffic-source.enum.js';
import { TrafficSourceValue } from '../interfaces/traffic-source-value.interface.js';

/**
 * A source and detail after staff edit them: an omitted (undefined) field keeps its value, null
 * clears it, a changed source without a detail drops the old detail, and a detail without a
 * source is rejected with 400 TRAFFIC_SOURCE_DETAIL_WITHOUT_SOURCE.
 */
export function editTrafficSource(
  current: TrafficSourceValue,
  source: TrafficSource | null | undefined,
  detail: string | null | undefined,
): TrafficSourceValue {
  const nextSource = source === undefined ? current.source : source;
  const nextDetail =
    detail !== undefined
      ? detail?.trim() || null
      : nextSource === current.source
        ? current.detail
        : null;
  if (nextDetail && !nextSource)
    throw new AppException(
      ErrorCode.TRAFFIC_SOURCE_DETAIL_WITHOUT_SOURCE,
      HttpStatus.BAD_REQUEST,
    );
  return { source: nextSource, detail: nextDetail };
}
