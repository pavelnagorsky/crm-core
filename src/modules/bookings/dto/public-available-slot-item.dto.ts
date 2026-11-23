import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { PricedSlot } from '../interfaces/priced-slot.interface.js';

export class PublicAvailableSlotItemDto {
  @ApiProperty({
    type: String,
    description: 'Slot start time, HH:mm in business timezone',
  })
  time: string;

  @ApiPrice({
    description:
      'Visit total at this time for the staff the "any staff" rule assigns (or the staff the client chose)',
  })
  price: string;

  @ApiProperty({
    type: String,
    isArray: true,
    description:
      'Staff assigned to the visit items, in the order of the items. Book with these ids to get this price.',
  })
  staffIds: string[];

  static fromResult(slot: PricedSlot): PublicAvailableSlotItemDto {
    return {
      time: slot.time,
      price: MoneyUtils.format(slot.price),
      staffIds: slot.staffIds,
    };
  }
}
