import { ApiProperty } from '@nestjs/swagger';

export class ServiceBundleItemResponseDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  serviceId: string;

  @ApiProperty({ type: String })
  serviceTitle: string;

  @ApiProperty({ type: Number })
  sortOrder: number;
}
