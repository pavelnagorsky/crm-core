import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { ServiceLevelPriceView } from '../interfaces/service-level-price-view.interface.js';

export class ServiceLevelPriceResponseDto {
  @ApiProperty({ type: String })
  levelId: string;

  @ApiProperty({ type: String })
  name: string;

  @ApiProperty({ type: Boolean })
  isDefault: boolean;

  @ApiPrice({
    nullable: true,
    description:
      'Own price of the level; null means the base price (always null for the default level).',
  })
  price: string | null;

  @ApiProperty({ type: Number })
  staffCount: number;

  static fromView(view: ServiceLevelPriceView): ServiceLevelPriceResponseDto {
    const dto = new ServiceLevelPriceResponseDto();
    dto.levelId = view.levelId;
    dto.name = view.name;
    dto.isDefault = view.isDefault;
    dto.price = view.price === null ? null : MoneyUtils.format(view.price);
    dto.staffCount = view.staffCount;
    return dto;
  }
}
