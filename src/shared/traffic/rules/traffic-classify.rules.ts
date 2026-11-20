import regularExpressions from '../../regular-expressions.js';
import { CLICK_ID_FIELDS } from '../constants/click-id-fields.constants.js';
import {
  CLICK_ID_MAX_LENGTH,
  UTM_CAMPAIGN_MAX_LENGTH,
  UTM_CONTENT_MAX_LENGTH,
  UTM_MEDIUM_MAX_LENGTH,
  UTM_SOURCE_MAX_LENGTH,
  UTM_TERM_MAX_LENGTH,
} from '../constants/traffic-limits.constants.js';
import {
  MAPS_HOST_PREFIXES,
  PAID_REFERRER_HOSTS,
  SEARCH_ENGINE_BRANDS,
  SEARCH_REFERRER_HOSTS,
  SOCIAL_REFERRER_HOSTS,
  TWO_GIS_HOST_LABEL,
} from '../constants/traffic-hosts.constants.js';
import {
  MAILING_MEDIUMS,
  MAPS_MEDIUMS,
  OFFLINE_MEDIUMS,
  PAID_MEDIUMS,
  REFERRAL_MEDIUMS,
  SEARCH_MEDIUMS,
} from '../constants/traffic-mediums.constants.js';
import {
  MAP_PLATFORM_SOURCES,
  REFERRAL_SOURCES,
  SEARCH_ENGINE_SOURCES,
  UTM_SOURCE_ALIASES,
} from '../constants/traffic-source-aliases.constants.js';
import { TrafficSource } from '../enums/traffic-source.enum.js';
import { ClassifiedTraffic } from '../interfaces/classified-traffic.interface.js';
import { TrafficClassification } from '../interfaces/traffic-classification.interface.js';
import { TrafficTouchRecord } from '../interfaces/traffic-touch-record.interface.js';
import { TrafficTouch } from '../interfaces/traffic-touch.interface.js';
import {
  isDomainOrSubdomain,
  isOwnHost,
  normalizeReferrerHost,
  normalizeTrafficDetail,
  normalizeTrafficToken,
} from './traffic-sanitize.rules.js';

/**
 * The marketing source of an online visit, first match wins:
 * 1. a paid click id, 2. a paid utm_medium, 3. a known utm_source, 4. a mailing, offline or
 * referral utm_medium, 5. a known referrer host (or ysclid without a referrer), 6. any other
 * utm_source, 7. any other external referrer, 8. fbclid alone, 9. a direct visit.
 * A referrer on one of ownHosts is no referrer. The touch keeps the evidence, never a decision.
 */
export function classifyTraffic(
  touch: TrafficTouch | null | undefined,
  ownHosts: readonly string[],
): ClassifiedTraffic {
  const visit = touch ?? {};
  const host = normalizeReferrerHost(visit.referrerHost);
  const externalHost = host && !isOwnHost(host, ownHosts) ? host : null;
  return {
    ...classify(visit, externalHost),
    touch: touchRecord(visit, externalHost),
  };
}

function classify(
  visit: TrafficTouch,
  host: string | null,
): TrafficClassification {
  const source = normalizeTrafficToken(visit.utmSource);
  const medium = normalizeTrafficToken(visit.utmMedium);

  const paidPlatform = CLICK_ID_FIELDS.find(
    (click) => click.paidPlatform && visit[click.field],
  )?.paidPlatform;
  if (paidPlatform)
    return result(TrafficSource.PAID_ADS, source ?? paidPlatform);
  if (medium && PAID_MEDIUMS.has(medium))
    return result(TrafficSource.PAID_ADS, source);

  const bySource = source ? classifySource(source, medium) : null;
  if (bySource) return bySource;

  const byMedium = classifyMedium(source, medium, visit.utmCampaign);
  if (byMedium) return byMedium;

  const byHost = host ? classifyHost(host, source) : null;
  if (byHost) return byHost;
  if (!host && visit.ysclid) return result(TrafficSource.SEARCH, 'yandex');

  if (source) return result(TrafficSource.OTHER, source);
  if (host) return result(TrafficSource.WEBSITE, host);
  if (visit.fbclid) return result(TrafficSource.INSTAGRAM, null);
  return result(TrafficSource.DIRECT, null);
}

function classifySource(
  source: string,
  medium: string | undefined,
): TrafficClassification | null {
  const alias = UTM_SOURCE_ALIASES.get(source);
  if (alias) return result(alias, null);
  const maps = MAP_PLATFORM_SOURCES.get(source);
  if (maps && medium && MAPS_MEDIUMS.has(medium)) return result(maps, null);
  if (
    SEARCH_ENGINE_SOURCES.has(source) &&
    (!medium || SEARCH_MEDIUMS.has(medium))
  )
    return result(TrafficSource.SEARCH, source);
  return null;
}

function classifyMedium(
  source: string | undefined,
  medium: string | undefined,
  campaign: string | undefined,
): TrafficClassification | null {
  if (medium && MAILING_MEDIUMS.has(medium))
    return result(TrafficSource.MAILING, source);
  if (medium && OFFLINE_MEDIUMS.has(medium))
    return result(TrafficSource.OFFLINE, source ?? campaign);
  const referralSource = source !== undefined && REFERRAL_SOURCES.has(source);
  if ((medium && REFERRAL_MEDIUMS.has(medium)) || referralSource)
    return result(TrafficSource.REFERRAL, referralSource ? null : source);
  return null;
}

function classifyHost(
  host: string,
  source: string | undefined,
): TrafficClassification | null {
  if (host.split('.').includes(TWO_GIS_HOST_LABEL))
    return result(TrafficSource.TWO_GIS, source);
  const maps = MAPS_HOST_PREFIXES.find((rule) => host.startsWith(rule.domain));
  if (maps) return result(maps.source, source);
  const social = SOCIAL_REFERRER_HOSTS.find((rule) =>
    isDomainOrSubdomain(host, rule.domain),
  );
  if (social) return result(social.source, source);
  const paid = PAID_REFERRER_HOSTS.find((rule) =>
    isDomainOrSubdomain(host, rule.domain),
  );
  if (paid) return result(TrafficSource.PAID_ADS, source ?? paid.engine);
  const engine = searchEngine(host);
  if (engine) return result(TrafficSource.SEARCH, engine);
  return null;
}

/** yandex.ru, google.com.tr and the fixed search domains; null for any other host. */
function searchEngine(host: string): string | null {
  const fixed = SEARCH_REFERRER_HOSTS.find((rule) =>
    isDomainOrSubdomain(host, rule.domain),
  );
  if (fixed) return fixed.engine;
  const [brand, ...zone] = host.split('.');
  if (
    SEARCH_ENGINE_BRANDS.includes(brand) &&
    regularExpressions.searchEngineZone.test(zone.join('.'))
  )
    return brand;
  return null;
}

function result(
  source: TrafficSource,
  detail: string | null | undefined,
): TrafficClassification {
  return { source, detail: normalizeTrafficDetail(detail) };
}

function touchRecord(
  visit: TrafficTouch,
  host: string | null,
): TrafficTouchRecord | null {
  const click = CLICK_ID_FIELDS.find((field) => visit[field.field]);
  const record: TrafficTouchRecord = {
    utmSource: cut(visit.utmSource, UTM_SOURCE_MAX_LENGTH),
    utmMedium: cut(visit.utmMedium, UTM_MEDIUM_MAX_LENGTH),
    utmCampaign: cut(visit.utmCampaign, UTM_CAMPAIGN_MAX_LENGTH),
    utmContent: cut(visit.utmContent, UTM_CONTENT_MAX_LENGTH),
    utmTerm: cut(visit.utmTerm, UTM_TERM_MAX_LENGTH),
    referrerHost: host,
    clickIdType: click?.type ?? null,
    clickId: click ? cut(visit[click.field], CLICK_ID_MAX_LENGTH) : null,
    touchedAt: visit.touchedAt ?? null,
  };
  const hasEvidence =
    record.utmSource ||
    record.utmMedium ||
    record.utmCampaign ||
    record.utmContent ||
    record.utmTerm ||
    record.referrerHost ||
    record.clickId;
  return hasEvidence ? record : null;
}

function cut(value: string | undefined, maxLength: number): string | null {
  return value ? value.slice(0, maxLength) : null;
}
