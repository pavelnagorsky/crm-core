import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { ServiceStatus } from '../enums/service-status.enum.js';

export class UpdateServiceStatusDto {
  @ApiProperty({ enum: ServiceStatus, enumName: 'ServiceStatus' })
  @IsEnum(ServiceStatus)
  status: ServiceStatus;
}
