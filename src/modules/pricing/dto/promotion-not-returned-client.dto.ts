import { ApiProperty } from '@nestjs/swagger';
import { PromotionNotReturnedClient } from '../interfaces/promotion-not-returned-client.interface.js';

export class PromotionNotReturnedClientDto {
  @ApiProperty({ type: String })
  clientId: string;

  @ApiProperty({ type: String })
  name: string;

  @ApiProperty({ type: String, nullable: true })
  phone: string | null;

  @ApiProperty({
    type: Date,
    description: 'Start of the last completed visit with the promotion.',
  })
  lastPromotionVisit: Date;

  static fromClient(
    client: PromotionNotReturnedClient,
  ): PromotionNotReturnedClientDto {
    const dto = new PromotionNotReturnedClientDto();
    dto.clientId = client.clientId;
    dto.name = client.name;
    dto.phone = client.phone;
    dto.lastPromotionVisit = client.lastPromotionVisit;
    return dto;
  }
}
