import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { PriceRulePreviewExample } from '../interfaces/price-rule-preview-example.interface.js';
import { minorToApi } from '../rules/pricing-money.rules.js';

export class PriceRulePreviewExampleDto {
  @ApiProperty({ type: String })
  serviceId: string;

  @ApiProperty({ type: String })
  serviceTitle: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Price level of the example; null when the location has no levels.',
  })
  levelName: string | null;

  @ApiPrice({ description: 'Price before the surcharges.' })
  before: string;

  @ApiPrice({ description: 'Before plus the surcharges, not rounded.' })
  raw: string;

  @ApiPrice({ description: 'Price after rounding to the location step.' })
  after: string;

  static fromExample(
    example: PriceRulePreviewExample,
  ): PriceRulePreviewExampleDto {
    const dto = new PriceRulePreviewExampleDto();
    dto.serviceId = example.serviceId;
    dto.serviceTitle = example.serviceTitle;
    dto.levelName = example.levelName;
    dto.before = minorToApi(example.before);
    dto.raw = minorToApi(example.raw);
    dto.after = minorToApi(example.after);
    return dto;
  }
}
