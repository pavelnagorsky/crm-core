import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class AvailableSlotsRequestDto {
  @ApiProperty({ type: String, description: 'Service UUID' })
  @IsUUID()
  serviceId: string;

  @ApiProperty({ type: String, required: false, nullable: true, description: 'Staff UUID. Omit for auto-assign to least-loaded staff.' })
  @IsOptional()
  @IsUUID()
  staffId?: string;
}
