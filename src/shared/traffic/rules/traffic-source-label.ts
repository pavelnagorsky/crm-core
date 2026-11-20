import { labelOf } from '../../i18n/label-of.js';

/** "Instagram" or "Платная реклама: vk_ads" for exports; empty when no source is set. */
export function trafficSourceLabel(
  labels: Record<string, string>,
  source: string | null,
  detail: string | null,
): string {
  const label = labelOf(labels, source);
  return label && detail ? `${label}: ${detail}` : label;
}
