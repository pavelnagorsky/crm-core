import { ApiProperty } from '@nestjs/swagger';

export class ClientReviewLinksDto {
  @ApiProperty({ type: String, nullable: true })
  google: string | null;

  @ApiProperty({ type: String, nullable: true })
  yandex: string | null;
}
