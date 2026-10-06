import { ApiProperty } from '@nestjs/swagger';
import { BookingItem } from '@prisma/client';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyService } from '../../../shared/money/money.service.js';

export class BookingItemResponseDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  serviceId: string;

  @ApiProperty({ type: String })
  serviceTitle: string;

  @ApiProperty({ type: Number })
  serviceDuration: number;

  @ApiPrice()
  listPrice: string;

  @ApiPrice()
  chargedPrice: string;

  @ApiPrice({ nullable: true })
  customPrice: string | null;

  @ApiProperty({ type: String })
  staffId: string;

  @ApiProperty({ type: String })
  staffName: string;

  @ApiProperty({ type: Date })
  startAt: Date;

  @ApiProperty({ type: Date })
  endAt: Date;

  @ApiProperty({ type: String, nullable: true })
  calendarEventId: string | null;

  static fromEntity(item: BookingItem): BookingItemResponseDto {
    const dto = new BookingItemResponseDto();
    dto.id = item.id;
    dto.serviceId = item.serviceId;
    dto.serviceTitle = item.serviceTitle;
    dto.serviceDuration = item.serviceDuration;
    dto.listPrice = MoneyService.format(item.listPrice);
    dto.chargedPrice = MoneyService.format(item.chargedPrice);
    dto.customPrice =
      item.customPrice == null ? null : MoneyService.format(item.customPrice);
    dto.staffId = item.staffId;
    dto.staffName = item.staffName;
    dto.startAt = item.startAt;
    dto.endAt = item.endAt;
    dto.calendarEventId = item.calendarEventId;
    return dto;
  }
}
