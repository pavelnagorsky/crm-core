export function labelOf(
  map: Record<string, string> | undefined,
  value: string | null | undefined,
): string {
  if (!value) return '';
  return map?.[value] ?? value;
}
