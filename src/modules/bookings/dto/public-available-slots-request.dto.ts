import { AvailableSlotsRequestDto } from '../../calendar/dto/available-slots-request.dto.js';
import { PromoCodeField } from '../decorators/promo-code-field.decorator.js';

/** Public slots of a selection; a promo code prices them with its promotion. */
export class PublicAvailableSlotsRequestDto extends AvailableSlotsRequestDto {
  @PromoCodeField()
  promoCode?: string;
}
