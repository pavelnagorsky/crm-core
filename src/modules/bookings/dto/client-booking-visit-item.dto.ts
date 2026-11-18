import { ApiProperty } from '@nestjs/swagger';
import { BookingWithItems } from '../interfaces/booking-with-items.interface.js';

export class ClientBookingVisitItemDto {
  @ApiProperty({ type: String, format: 'uuid' })
  serviceId: string;

  @ApiProperty({
    type: String,
    description: 'Service title saved on the booking',
  })
  title: string;

  @ApiProperty({ type: String, format: 'uuid' })
  staffId: string;

  @ApiProperty({
    type: String,
    description: 'Staff name saved on the booking',
  })
  staffName: string;

  static fromItem(
    item: BookingWithItems['items'][number],
  ): ClientBookingVisitItemDto {
    return Object.assign(new ClientBookingVisitItemDto(), {
      serviceId: item.serviceId,
      title: item.serviceTitle,
      staffId: item.staffId,
      staffName: item.staffName,
    });
  }
}
