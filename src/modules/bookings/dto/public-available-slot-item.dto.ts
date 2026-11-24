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
      'Visit total at this time for the staff the "any staff" rule assigns (or the staff the client chose), promotions included',
  })
  price: string;

  @ApiPrice({
    required: false,
    description:
      'Old price: only when a promotion shown to clients lowers this slot. Missing otherwise',
  })
  listPrice?: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    required: false,
    description: 'The promotion that lowers this slot (with listPrice)',
  })
  promotionId?: string;

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
      ...(slot.listPrice != null && {
        listPrice: MoneyUtils.format(slot.listPrice),
      }),
      ...(slot.promotionId != null && { promotionId: slot.promotionId }),
      staffIds: slot.staffIds,
    };
  }
}
