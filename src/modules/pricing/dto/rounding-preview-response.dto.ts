import { ApiProperty } from '@nestjs/swagger';
import { RoundingPreviewExample } from '../interfaces/rounding-preview-example.interface.js';
import { RoundingPreviewExampleDto } from './rounding-preview-example.dto.js';

export class RoundingPreviewResponseDto {
  @ApiProperty({ type: () => RoundingPreviewExampleDto, isArray: true })
  examples: RoundingPreviewExampleDto[];

  static fromExamples(
    examples: RoundingPreviewExample[],
  ): RoundingPreviewResponseDto {
    const dto = new RoundingPreviewResponseDto();
    dto.examples = examples.map(RoundingPreviewExampleDto.fromExample);
    return dto;
  }
}
