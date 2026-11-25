import { ApiProperty } from '@nestjs/swagger';

export class ServicePriceUpcomingNextDto {
  @ApiProperty({ type: String, example: '2027-01-01' })
  effectiveDate: string;

  @ApiProperty({ type: String, format: 'uuid', isArray: true })
  changeIds: string[];

  @ApiProperty({ type: Number })
  changesCount: number;

  @ApiProperty({ type: Number })
  servicesCount: number;

  @ApiProperty({ type: Number })
  bundlesCount: number;
}
