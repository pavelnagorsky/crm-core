import { ApiProperty } from '@nestjs/swagger';

export class BookingFormThemeDto {
  @ApiProperty({ type: String, example: '#141210' })
  background: string;

  @ApiProperty({ type: String, example: '#221E1A' })
  surface: string;

  @ApiProperty({ type: String, example: '#F7F1E8' })
  text: string;

  @ApiProperty({ type: String, example: '#B7A99A' })
  muted: string;

  @ApiProperty({ type: String, example: '#E4C4A0' })
  accent: string;

  @ApiProperty({ type: String, example: '#1A140E' })
  accentText: string;

  @ApiProperty({ type: String, example: 'rgba(247,241,232,0.14)' })
  line: string;

  static from(
    tokens: {
      background: string;
      surface: string;
      text: string;
      muted: string;
      accent: string;
      accentText: string;
    },
    line: string,
  ): BookingFormThemeDto {
    const dto = new BookingFormThemeDto();
    dto.background = tokens.background;
    dto.surface = tokens.surface;
    dto.text = tokens.text;
    dto.muted = tokens.muted;
    dto.accent = tokens.accent;
    dto.accentText = tokens.accentText;
    dto.line = line;
    return dto;
  }
}
