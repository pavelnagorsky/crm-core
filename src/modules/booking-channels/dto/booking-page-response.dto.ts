import { ApiProperty } from '@nestjs/swagger';
import { FileResponseDto } from '../../../shared/dto/file-response.dto.js';
import { BookingChannelStatus } from '../enums/booking-channel-status.enum.js';
import { BookingPageWithCover } from '../interfaces/booking-page-with-cover.interface.js';
import {
  resolveBookingFormTheme,
  toBookingFormConfig,
} from '../booking-form.js';
import { BookingFormConfigDto } from './booking-form-config.dto.js';
import { BookingFormThemeDto } from './booking-form-theme.dto.js';

export class BookingPageResponseDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  locationId: string;

  @ApiProperty({ type: String })
  title: string;

  @ApiProperty({ type: String })
  slug: string;

  @ApiProperty({ enum: BookingChannelStatus, enumName: 'BookingChannelStatus' })
  status: BookingChannelStatus;

  @ApiProperty({ type: () => BookingFormConfigDto })
  form: BookingFormConfigDto;

  @ApiProperty({ type: () => BookingFormThemeDto })
  theme: BookingFormThemeDto;

  @ApiProperty({ type: String })
  tagline: string;

  @ApiProperty({ type: String })
  html: string;

  @ApiProperty({ type: String })
  metaTitle: string;

  @ApiProperty({ type: String })
  metaDescription: string;

  @ApiProperty({ type: () => FileResponseDto, nullable: true })
  cover: FileResponseDto | null;

  @ApiProperty({ type: Date })
  createdAt: Date;

  @ApiProperty({ type: Date })
  updatedAt: Date;

  @ApiProperty({ type: Date, nullable: true })
  publishedAt: Date | null;

  static fromEntity(page: BookingPageWithCover): BookingPageResponseDto {
    const dto = new BookingPageResponseDto();
    dto.id = page.id;
    dto.locationId = page.locationId;
    dto.title = page.title;
    dto.slug = page.slug;
    dto.status = page.status;
    dto.form = toBookingFormConfig(page);
    dto.theme = resolveBookingFormTheme(page);
    dto.tagline = page.tagline;
    dto.html = page.html;
    dto.metaTitle = page.metaTitle;
    dto.metaDescription = page.metaDescription;
    dto.cover = page.coverFile
      ? FileResponseDto.fromEntity(page.coverFile)
      : null;
    dto.createdAt = page.createdAt;
    dto.updatedAt = page.updatedAt;
    dto.publishedAt = page.publishedAt;
    return dto;
  }
}
