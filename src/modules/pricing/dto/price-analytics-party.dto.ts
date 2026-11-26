import { ApiProperty } from '@nestjs/swagger';

/** A client or a staff member of an item. */
export class PriceAnalyticsPartyDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id: string;

  @ApiProperty({ type: String })
  name: string;
}
