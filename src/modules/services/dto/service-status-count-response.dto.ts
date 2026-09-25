import { ApiProperty } from '@nestjs/swagger';
import { ServiceStatus } from '../enums/service-status.enum.js';

export class ServiceStatusCountResponseDto {
  @ApiProperty({ enum: ServiceStatus, enumName: 'ServiceStatus' })
  status: ServiceStatus;

  @ApiProperty({ type: Number })
  count: number;
}
