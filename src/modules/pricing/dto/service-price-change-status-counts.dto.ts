import { ApiProperty } from '@nestjs/swagger';

/** Changes of the location by status, for the history tabs. */
export class ServicePriceChangeStatusCountsDto {
  @ApiProperty({ type: Number })
  all: number;

  @ApiProperty({ type: Number })
  SCHEDULED: number;

  @ApiProperty({ type: Number })
  APPLIED: number;

  @ApiProperty({ type: Number })
  CANCELLED: number;

  @ApiProperty({ type: Number })
  ROLLED_BACK: number;
}
