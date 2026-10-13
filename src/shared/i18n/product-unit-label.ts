import { ProductUnitLabel } from '../interfaces/product-unit-label.interface.js';

export function productUnitLabelOf(
  map: Record<string, ProductUnitLabel> | undefined,
  value: string | null | undefined,
  quantity?: { toString(): string } | string | number | null,
): string {
  if (!value) return '';
  const label = map?.[value];
  if (!label) return value;
  return `${unitName(label, quantity)} (${label.short})`;
}

function unitName(
  label: ProductUnitLabel,
  quantity?: { toString(): string } | string | number | null,
): string {
  const plural = russianPluralForm(quantity);
  return plural ? label[plural] : label.one;
}

function russianPluralForm(
  quantity?: { toString(): string } | string | number | null,
): 'one' | 'few' | 'many' | null {
  if (quantity == null) return null;
  const raw = quantity.toString().trim();
  if (!raw) return null;
  const normalized = raw.replace(',', '.');
  if (normalized.includes('.')) {
    const fractional = normalized.split('.')[1]?.replace(/0+$/, '');
    if (fractional) return 'few';
  }
  const absolute = Math.abs(Number.parseInt(normalized, 10));
  if (!Number.isFinite(absolute)) return null;
  const mod10 = absolute % 10;
  const mod100 = absolute % 100;
  if (mod10 === 1 && mod100 !== 11) return 'one';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'few';
  return 'many';
}
