import { ApiProperty } from '@nestjs/swagger';
import { StaffStatus } from '@prisma/client';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { ServiceStaffPriceView } from '../interfaces/service-staff-price-view.interface.js';

export class ServiceStaffPriceResponseDto {
  @ApiProperty({ type: String })
  staffId: string;

  @ApiProperty({ type: String })
  name: string;

  @ApiProperty({ type: String, nullable: true })
  avatarUrl: string | null;

  @ApiProperty({ enum: StaffStatus, enumName: 'StaffStatus' })
  status: StaffStatus;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Null: the default level.',
  })
  levelId: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Name of the level; the default level name when the location has levels.',
  })
  levelName: string | null;

  @ApiPrice({ description: 'Price by the level of the staff member.' })
  levelPrice: string;

  @ApiPrice({
    nullable: true,
    description: 'Personal price of the staff member.',
  })
  personalPrice: string | null;

  @ApiPrice({ description: 'Personal price, else the level price.' })
  price: string;

  static fromView(view: ServiceStaffPriceView): ServiceStaffPriceResponseDto {
    const dto = new ServiceStaffPriceResponseDto();
    dto.staffId = view.staffId;
    dto.name = view.name;
    dto.avatarUrl = view.avatarFile?.url ?? null;
    dto.status = view.status;
    dto.levelId = view.levelId;
    dto.levelName = view.levelName;
    dto.levelPrice = MoneyUtils.format(view.levelPrice);
    dto.personalPrice =
      view.personalPrice === null
        ? null
        : MoneyUtils.format(view.personalPrice);
    dto.price = MoneyUtils.format(view.price);
    return dto;
  }
}
