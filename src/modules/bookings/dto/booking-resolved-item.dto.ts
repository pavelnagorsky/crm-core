import { ApiProperty } from '@nestjs/swagger';
import { ResolvedBookingItem } from '../interfaces/resolved-booking-item.interface.js';

export class BookingResolvedItemDto {
  @ApiProperty({ type: String })
  serviceId: string;

  @ApiProperty({ type: String })
  serviceTitle: string;

  @ApiProperty({ type: String })
  staffId: string;

  @ApiProperty({ type: String })
  staffName: string;

  @ApiProperty({ type: Date })
  startAt: Date;

  @ApiProperty({ type: Date })
  endAt: Date;

  static fromResult(item: ResolvedBookingItem): BookingResolvedItemDto {
    return {
      serviceId: item.serviceId,
      serviceTitle: item.serviceTitle,
      staffId: item.staffId,
      staffName: item.staffName,
      startAt: item.startAt,
      endAt: item.endAt,
    };
  }
}
