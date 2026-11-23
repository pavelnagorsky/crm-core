import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { BookingStaffOption } from '../interfaces/booking-staff-option.interface.js';

export class BookingResolveStaffDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  name: string;

  @ApiPrice({
    description:
      'What this staff member charges for the selection: the sum of the lines they would take. In staffByService, the price of that one service.',
  })
  price: string;

  static fromResult(staff: BookingStaffOption): BookingResolveStaffDto {
    return {
      id: staff.id,
      name: staff.name,
      price: MoneyUtils.format(staff.price),
    };
  }
}
