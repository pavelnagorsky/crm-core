import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { PriceRuleSkipReason } from '../engine/enums/price-rule-skip-reason.enum.js';
import { PromoCodeStatus } from '../engine/enums/promo-code-status.enum.js';
import { PromoCodeResult } from '../engine/interfaces/promo-code-result.interface.js';

/** What the promo code of a visit did (docs/pricing-stage4-api.md). */
export class PromoCodeResultDto {
  @ApiProperty({ type: String, example: 'AUTUMN', description: 'Upper case.' })
  code: string;

  @ApiProperty({ enum: PromoCodeStatus, enumName: 'PromoCodeStatus' })
  status: PromoCodeStatus;

  @ApiProperty({
    enum: PriceRuleSkipReason,
    enumName: 'PriceRuleSkipReason',
    nullable: true,
    description: 'NOT_APPLICABLE only: the first condition that does not hold.',
  })
  reason: PriceRuleSkipReason | null;

  @ApiPrice({
    nullable: true,
    description:
      'BELOW_MIN_TOTAL only: the visit total the promotion needs, else null.',
  })
  minVisitTotal: string | null;

  static fromResult(
    result: PromoCodeResult | null | undefined,
  ): PromoCodeResultDto | null {
    if (!result) return null;
    const dto = new PromoCodeResultDto();
    dto.code = result.code;
    dto.status = result.status;
    dto.reason = result.reason;
    dto.minVisitTotal =
      result.minVisitTotal === null
        ? null
        : MoneyUtils.format(MoneyUtils.fromMinor(result.minVisitTotal));
    return dto;
  }
}
