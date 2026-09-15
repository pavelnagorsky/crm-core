import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateServiceStatusDto {
  @ApiProperty({ type: Boolean })
  @IsBoolean()
  isActive: boolean;
}
