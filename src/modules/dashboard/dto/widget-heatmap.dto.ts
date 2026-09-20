import { ApiProperty } from '@nestjs/swagger';

export class WidgetHeatmapDto {
  @ApiProperty({ type: [String] })
  xLabels: string[];

  @ApiProperty({ type: [String] })
  yLabels: string[];

  @ApiProperty({ type: 'array', items: { type: 'array', items: { type: 'number' } }, description: 'matrix[y][x]' })
  matrix: number[][];
}
