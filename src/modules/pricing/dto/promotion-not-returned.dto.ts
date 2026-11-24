import { ApiProperty } from '@nestjs/swagger';
import { PromotionNotReturnedClientDto } from './promotion-not-returned-client.dto.js';

export class PromotionNotReturnedDto {
  @ApiProperty({ type: Number })
  count: number;

  @ApiProperty({
    type: () => PromotionNotReturnedClientDto,
    isArray: true,
    description: 'First 50 by the promotion visit, newest first.',
  })
  items: PromotionNotReturnedClientDto[];
}
