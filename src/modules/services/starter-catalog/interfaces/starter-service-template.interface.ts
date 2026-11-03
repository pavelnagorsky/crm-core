export interface StarterServiceTemplate {
  title: string;
  durationMinutes: number;
  prices: Readonly<Record<'RUB' | 'BYN' | 'KZT', string>>;
}
