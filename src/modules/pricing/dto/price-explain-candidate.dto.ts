import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { PriceExplainCandidate } from '../interfaces/price-explain-candidate.interface.js';
import { minorToApi } from '../rules/pricing-money.rules.js';

export class PriceExplainCandidateDto {
  @ApiProperty({ type: String })
  staffId: string;

  @ApiProperty({ type: String })
  name: string;

  @ApiProperty({ type: String, nullable: true })
  levelName: string | null;

  @ApiProperty({
    type: Boolean,
    description: 'Has a personal price for the service.',
  })
  personal: boolean;

  @ApiPrice({ description: 'Total of the visit with this staff member, discounts included.' })
  price: string;

  @ApiProperty({
    type: Boolean,
    description: 'Free for the whole visit at that time.',
  })
  available: boolean;

  static fromCandidate(
    candidate: PriceExplainCandidate,
  ): PriceExplainCandidateDto {
    const dto = new PriceExplainCandidateDto();
    dto.staffId = candidate.staffId;
    dto.name = candidate.name;
    dto.levelName = candidate.levelName;
    dto.personal = candidate.personal;
    dto.price = minorToApi(candidate.price);
    dto.available = candidate.available;
    return dto;
  }
}
