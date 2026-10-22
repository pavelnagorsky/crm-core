import { BookingPaletteTokens } from './booking-palette-tokens.interface.js';

export interface BookingPalettePreset extends BookingPaletteTokens {
  label: string;
  description: string;
  line: string;
}
