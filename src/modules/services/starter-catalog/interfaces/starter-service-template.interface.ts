import { CountryCurrency } from '../../../../shared/geo/country-defaults.js';

export interface StarterServiceTemplate {
  title: string;
  durationMinutes: number;
  /** One price per supported country currency; adding a country requires starter prices. */
  prices: Readonly<Record<CountryCurrency, string>>;
}
