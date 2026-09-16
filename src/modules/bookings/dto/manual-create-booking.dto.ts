import { IsOptionalPrice } from '../../../shared/decorators/is-price.decorator.js';
import { CreateBookingDto } from './create-booking.dto.js';

export class ManualCreateBookingDto extends CreateBookingDto {
  @IsOptionalPrice()
  customPrice?: string;
}
