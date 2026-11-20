import { ApiProperty } from '@nestjs/swagger';
import { BookingTrafficTouch } from '@prisma/client';
import { ClickIdType } from '../../../shared/traffic/enums/click-id-type.enum.js';

/** What the visitor's last touch said, as recorded with an online booking. The click id itself is never shown. */
export class BookingTrafficTouchResponseDto {
  @ApiProperty({ type: String, nullable: true })
  utmSource: string | null;

  @ApiProperty({ type: String, nullable: true })
  utmMedium: string | null;

  @ApiProperty({ type: String, nullable: true })
  utmCampaign: string | null;

  @ApiProperty({ type: String, nullable: true })
  utmContent: string | null;

  @ApiProperty({ type: String, nullable: true })
  utmTerm: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'External referrer host, without www.',
  })
  referrerHost: string | null;

  @ApiProperty({
    enum: ClickIdType,
    enumName: 'ClickIdType',
    nullable: true,
    description:
      'Kind of ad click id the visit carried; the id is erased after 90 days and never returned',
  })
  clickIdType: ClickIdType | null;

  @ApiProperty({
    type: Date,
    nullable: true,
    description: 'When the visitor arrived with this touch',
  })
  touchedAt: Date | null;

  static fromEntity(
    touch: BookingTrafficTouch,
  ): BookingTrafficTouchResponseDto {
    const dto = new BookingTrafficTouchResponseDto();
    dto.utmSource = touch.utmSource;
    dto.utmMedium = touch.utmMedium;
    dto.utmCampaign = touch.utmCampaign;
    dto.utmContent = touch.utmContent;
    dto.utmTerm = touch.utmTerm;
    dto.referrerHost = touch.referrerHost;
    dto.clickIdType = touch.clickIdType as ClickIdType | null;
    dto.touchedAt = touch.touchedAt;
    return dto;
  }
}
