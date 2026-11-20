import { ApiProperty } from '@nestjs/swagger';
import { IsDate, IsOptional, IsString } from 'class-validator';
import { SanitizeTouchedAt } from '../../transforms/sanitize-touched-at.transform.js';
import { SanitizeTrafficValue } from '../../transforms/sanitize-traffic-value.transform.js';
import {
  CLICK_ID_MAX_LENGTH,
  REFERRER_INPUT_MAX_LENGTH,
  UTM_CAMPAIGN_MAX_LENGTH,
  UTM_CONTENT_MAX_LENGTH,
  UTM_MEDIUM_MAX_LENGTH,
  UTM_SOURCE_MAX_LENGTH,
  UTM_TERM_MAX_LENGTH,
} from '../constants/traffic-limits.constants.js';
import { TrafficTouch } from '../interfaces/traffic-touch.interface.js';

const UTM_NOTE =
  'Raw value from the landing URL. Cut to the max length; dropped if it holds an email or 7+ digits in a row.';
const CLICK_NOTE = 'Raw click id from the landing URL. Cut to 255.';

/**
 * The visitor's last non-direct touch (30 days), stored on the client and sent raw: the backend
 * classifies it. Every field is optional and is cleaned, never rejected: a bad value is dropped.
 */
export class TrafficTouchDto implements TrafficTouch {
  @ApiProperty({ type: String, required: false, description: UTM_NOTE })
  @SanitizeTrafficValue(UTM_SOURCE_MAX_LENGTH, true)
  @IsOptional()
  @IsString()
  utmSource?: string;

  @ApiProperty({ type: String, required: false, description: UTM_NOTE })
  @SanitizeTrafficValue(UTM_MEDIUM_MAX_LENGTH, true)
  @IsOptional()
  @IsString()
  utmMedium?: string;

  @ApiProperty({ type: String, required: false, description: UTM_NOTE })
  @SanitizeTrafficValue(UTM_CAMPAIGN_MAX_LENGTH, true)
  @IsOptional()
  @IsString()
  utmCampaign?: string;

  @ApiProperty({ type: String, required: false, description: UTM_NOTE })
  @SanitizeTrafficValue(UTM_CONTENT_MAX_LENGTH, true)
  @IsOptional()
  @IsString()
  utmContent?: string;

  @ApiProperty({ type: String, required: false, description: UTM_NOTE })
  @SanitizeTrafficValue(UTM_TERM_MAX_LENGTH, true)
  @IsOptional()
  @IsString()
  utmTerm?: string;

  @ApiProperty({ type: String, required: false, description: CLICK_NOTE })
  @SanitizeTrafficValue(CLICK_ID_MAX_LENGTH)
  @IsOptional()
  @IsString()
  gclid?: string;

  @ApiProperty({ type: String, required: false, description: CLICK_NOTE })
  @SanitizeTrafficValue(CLICK_ID_MAX_LENGTH)
  @IsOptional()
  @IsString()
  gbraid?: string;

  @ApiProperty({ type: String, required: false, description: CLICK_NOTE })
  @SanitizeTrafficValue(CLICK_ID_MAX_LENGTH)
  @IsOptional()
  @IsString()
  wbraid?: string;

  @ApiProperty({ type: String, required: false, description: CLICK_NOTE })
  @SanitizeTrafficValue(CLICK_ID_MAX_LENGTH)
  @IsOptional()
  @IsString()
  yclid?: string;

  @ApiProperty({
    type: String,
    required: false,
    description: `${CLICK_NOTE} Yandex search result marker, not an ad click.`,
  })
  @SanitizeTrafficValue(CLICK_ID_MAX_LENGTH)
  @IsOptional()
  @IsString()
  ysclid?: string;

  @ApiProperty({ type: String, required: false, description: CLICK_NOTE })
  @SanitizeTrafficValue(CLICK_ID_MAX_LENGTH)
  @IsOptional()
  @IsString()
  fbclid?: string;

  @ApiProperty({ type: String, required: false, description: CLICK_NOTE })
  @SanitizeTrafficValue(CLICK_ID_MAX_LENGTH)
  @IsOptional()
  @IsString()
  ttclid?: string;

  @ApiProperty({ type: String, required: false, description: CLICK_NOTE })
  @SanitizeTrafficValue(CLICK_ID_MAX_LENGTH)
  @IsOptional()
  @IsString()
  msclkid?: string;

  @ApiProperty({
    type: String,
    required: false,
    description:
      'Host of document.referrer (a full URL is accepted, only the host is kept). Our own hosts and invalid hosts are ignored.',
  })
  @SanitizeTrafficValue(REFERRER_INPUT_MAX_LENGTH)
  @IsOptional()
  @IsString()
  referrerHost?: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    required: false,
    description:
      'When the touch happened (ISO). Dropped if older than 31 days or more than 5 minutes ahead.',
  })
  @SanitizeTouchedAt()
  @IsOptional()
  @IsDate()
  touchedAt?: Date;
}
