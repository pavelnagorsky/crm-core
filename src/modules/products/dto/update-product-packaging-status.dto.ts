import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateProductPackagingStatusDto {
  @ApiProperty({ type: Boolean })
  @IsBoolean()
  isActive: boolean;
}
