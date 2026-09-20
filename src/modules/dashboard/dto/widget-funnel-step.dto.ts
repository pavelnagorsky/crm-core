import { ApiProperty } from '@nestjs/swagger';

export class WidgetFunnelStepDto {
  @ApiProperty({ type: String })
  label: string;

  @ApiProperty({ type: Number })
  value: number;

  @ApiProperty({ type: Number, required: false, description: 'Conversion from previous step in percent' })
  conversionFromPrev?: number;
}
