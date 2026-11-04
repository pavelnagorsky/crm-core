import { ApiProperty } from '@nestjs/swagger';
import { BookingWidgetInitialization } from '@prisma/client';

export class BookingWidgetInitializationResponseDto {
  @ApiProperty({
    type: Date,
    description: 'Server time of widget initialization',
  })
  createdAt: Date;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Embedding page URL; null for requests without X-Widget-Page-Url',
  })
  url: string | null;

  static fromEntity(
    entity: BookingWidgetInitialization,
  ): BookingWidgetInitializationResponseDto {
    const dto = new BookingWidgetInitializationResponseDto();
    dto.createdAt = entity.createdAt;
    dto.url = entity.url;
    return dto;
  }
}
