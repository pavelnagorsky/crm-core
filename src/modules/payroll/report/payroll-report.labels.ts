export function safeSheetName(name: string, fallback: string): string {
  const cleaned = name.replace(/[\\/*?:[\]]/g, ' ').trim() || fallback;
  return cleaned.slice(0, 31);
}
