/**
 * One stored form for a phone, shared by manual create and import.
 * National trunk prefixes used in Belarus and Russia are expanded so
 * "8029…" and "+37529…" cannot become two clients.
 */
export function canonicalPhone(value: string): string {
  let digits = value.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (!digits) return '';
  if (digits.length === 11 && digits.startsWith('80')) return `+375${digits.slice(2)}`;
  if (digits.length === 11 && digits.startsWith('8')) return `+7${digits.slice(1)}`;
  return `+${digits}`;
}
