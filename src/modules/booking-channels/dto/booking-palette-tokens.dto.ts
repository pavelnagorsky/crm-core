import { IsHexColor } from '../decorators/is-hex-color.decorator.js';
import { BookingPaletteTokens } from '../interfaces/booking-palette-tokens.interface.js';

export class BookingPaletteTokensDto implements BookingPaletteTokens {
  @IsHexColor()
  background: string;

  @IsHexColor()
  surface: string;

  @IsHexColor()
  text: string;

  @IsHexColor()
  muted: string;

  @IsHexColor()
  accent: string;

  @IsHexColor()
  accentText: string;
}
