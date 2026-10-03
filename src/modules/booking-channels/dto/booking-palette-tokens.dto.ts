import { IsHexColor } from '../decorators/is-hex-color.decorator.js';

export class BookingPaletteTokensDto {
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
