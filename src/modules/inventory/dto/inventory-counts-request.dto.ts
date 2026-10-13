import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class InventoryCountsRequestDto {
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;
}
