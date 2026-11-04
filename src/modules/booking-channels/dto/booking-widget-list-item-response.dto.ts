import { ApiProperty } from '@nestjs/swagger';
import { BookingChannelStats } from '../interfaces/booking-channel-stats.interface.js';
import { BookingWidgetWithInitializationHistory } from '../interfaces/booking-widget-with-initialization-history.interface.js';
import { BookingWidgetInitializationResponseDto } from './booking-widget-initialization-response.dto.js';
import { BookingWidgetResponseDto } from './booking-widget-response.dto.js';

export class BookingWidgetListItemResponseDto extends BookingWidgetResponseDto {
  @ApiProperty({
    type: () => BookingWidgetInitializationResponseDto,
    isArray: true,
  })
  initializationHistory: BookingWidgetInitializationResponseDto[];

  static fromListEntity(
    widget: BookingWidgetWithInitializationHistory,
    stats?: BookingChannelStats,
  ): BookingWidgetListItemResponseDto {
    const dto = Object.assign(
      new BookingWidgetListItemResponseDto(),
      BookingWidgetResponseDto.fromEntity(widget, stats),
    );
    dto.initializationHistory = widget.initializationHistory.map(
      BookingWidgetInitializationResponseDto.fromEntity,
    );
    return dto;
  }
}
