import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { RoundingPreviewExample } from '../interfaces/rounding-preview-example.interface.js';
import { minorToApi } from '../rules/pricing-money.rules.js';

export class RoundingPreviewExampleDto {
  @ApiProperty({ type: String })
  serviceTitle: string;

  @ApiPrice()
  basePrice: string;

  @ApiProperty({ type: String, example: 'наценка +20%' })
  label: string;

  @ApiPrice({ description: 'Price after the surcharge, not rounded.' })
  raw: string;

  @ApiPrice({ description: 'Price rounded to the previewed step.' })
  rounded: string;

  @ApiProperty({
    type: Boolean,
    description: 'The rounding moved the price by more than 5%.',
  })
  largeStep: boolean;

  static fromExample(
    example: RoundingPreviewExample,
  ): RoundingPreviewExampleDto {
    const dto = new RoundingPreviewExampleDto();
    dto.serviceTitle = example.serviceTitle;
    dto.basePrice = minorToApi(example.basePrice);
    dto.label = example.label;
    dto.raw = minorToApi(example.raw);
    dto.rounded = minorToApi(example.rounded);
    dto.largeStep = example.largeStep;
    return dto;
  }
}
