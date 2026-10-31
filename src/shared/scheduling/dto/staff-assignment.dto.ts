import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class StaffAssignmentDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  serviceId: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    required: false,
    description: 'Omit or pass null for automatic assignment.',
  })
  @IsOptional()
  @IsUUID()
  staffId?: string | null;
}
