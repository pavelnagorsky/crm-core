import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreatePayrollPeriodDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  businessId: string;

  @ApiProperty({ type: String, example: '2026-09-01' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ type: String, example: '2026-09-30' })
  @IsDateString()
  endDate: string;

  @ApiProperty({ type: String, required: false, maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;
}
