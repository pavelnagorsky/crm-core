import { ApiProperty } from '@nestjs/swagger';
import { PublicBookingPageListEntry } from '../interfaces/public-booking-page-list-entry.interface.js';

export class PublicBookingPageListItemDto {
  @ApiProperty({ type: String, example: 'studio-lumi' })
  slug: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-11-05T10:20:30.000Z',
  })
  updatedAt: string;

  static fromEntry(
    entry: PublicBookingPageListEntry,
  ): PublicBookingPageListItemDto {
    const dto = new PublicBookingPageListItemDto();
    dto.slug = entry.slug;
    dto.updatedAt = entry.updatedAt.toISOString();
    return dto;
  }
}
