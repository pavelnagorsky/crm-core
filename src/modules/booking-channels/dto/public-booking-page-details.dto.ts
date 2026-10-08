import { ApiProperty } from '@nestjs/swagger';
import { FileResponseDto } from '../../../shared/dto/file-response.dto.js';
import { BookingPageWithCover } from '../interfaces/booking-page-with-cover.interface.js';
import { sanitizeBookingHtml } from '../rendering/booking-html.js';

export class PublicBookingPageDetailsDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  title: string;

  @ApiProperty({ type: String })
  slug: string;

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

  static from(page: BookingPageWithCover): PublicBookingPageDetailsDto {
    const dto = new PublicBookingPageDetailsDto();
    dto.id = page.id;
    dto.title = page.title;
    dto.slug = page.slug;
    dto.tagline = page.tagline;
    dto.html = sanitizeBookingHtml(page.html);
    dto.metaTitle = page.metaTitle;
    dto.metaDescription = page.metaDescription;
    dto.cover = page.coverFile
      ? FileResponseDto.fromEntity(page.coverFile)
      : null;
    return dto;
  }
}
