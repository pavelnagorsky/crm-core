import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { PersonalPrice } from '../interfaces/personal-price.interface.js';

export class PersonalPriceResponseDto {
  @ApiProperty({ type: String })
  staffId: string;

  @ApiProperty({ type: String })
  staffName: string;

  @ApiProperty({ type: String, nullable: true })
  avatarUrl: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Level of the staff member; the default level name when none is set.',
  })
  levelName: string | null;

  @ApiProperty({ type: String })
  serviceId: string;

  @ApiProperty({ type: String })
  serviceTitle: string;

  @ApiPrice({ description: 'Price the level gives: its own, else the base price.' })
  levelPrice: string;

  @ApiPrice({ description: 'Personal price of the staff member.' })
  price: string;

  static fromPrice(item: PersonalPrice): PersonalPriceResponseDto {
    const dto = new PersonalPriceResponseDto();
    dto.staffId = item.staffId;
    dto.staffName = item.staffName;
    dto.avatarUrl = item.avatarUrl;
    dto.levelName = item.levelName;
    dto.serviceId = item.serviceId;
    dto.serviceTitle = item.serviceTitle;
    dto.levelPrice = MoneyUtils.format(item.levelPrice);
    dto.price = MoneyUtils.format(item.price);
    return dto;
  }
}
