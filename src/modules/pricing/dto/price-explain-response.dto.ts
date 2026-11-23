import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { PriceExplain } from '../interfaces/price-explain.interface.js';
import { minorToApi } from '../rules/pricing-money.rules.js';
import { PriceExplainCandidateDto } from './price-explain-candidate.dto.js';
import { PriceExplainLineDto } from './price-explain-line.dto.js';
import { PriceExplainNotAppliedDto } from './price-explain-not-applied.dto.js';

export class PriceExplainResponseDto {
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'The staff member priced; null when "any staff" found nobody free.',
  })
  staffId: string | null;

  @ApiProperty({ type: String, nullable: true })
  staffName: string | null;

  @ApiProperty({ type: String, nullable: true })
  levelName: string | null;

  @ApiPrice()
  total: string;

  @ApiProperty({
    type: () => PriceExplainLineDto,
    description: 'A bundle is summed over its lines.',
  })
  line: PriceExplainLineDto;

  @ApiProperty({ type: () => PriceExplainCandidateDto, isArray: true })
  candidates: PriceExplainCandidateDto[];

  @ApiProperty({ type: () => PriceExplainNotAppliedDto, isArray: true })
  notApplied: PriceExplainNotAppliedDto[];

  static fromExplain(explain: PriceExplain): PriceExplainResponseDto {
    const dto = new PriceExplainResponseDto();
    dto.staffId = explain.staffId;
    dto.staffName = explain.staffName;
    dto.levelName = explain.levelName;
    dto.total = minorToApi(explain.total);
    dto.line = PriceExplainLineDto.fromLine(explain.line);
    dto.candidates = explain.candidates.map(
      PriceExplainCandidateDto.fromCandidate,
    );
    dto.notApplied = explain.notApplied.map(
      PriceExplainNotAppliedDto.fromNotApplied,
    );
    return dto;
  }
}
