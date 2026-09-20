import { ApiProperty } from '@nestjs/swagger';

export class WidgetBreakdownItemDto {
  @ApiProperty({ type: String, required: false, nullable: true })
  id?: string | null;

  @ApiProperty({ type: String })
  label: string;

  @ApiProperty({ type: Number })
  value: number;

  @ApiProperty({ type: Number, required: false })
  secondaryValue?: number;

  @ApiProperty({ type: Number, required: false })
  sharePct?: number;
}
