import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/** The form fields next to the file of a price import. */
export class ServicePriceImportRequestDto {
  @ApiProperty({
    type: String,
    required: false,
    example: '2027-01-01',
    description: 'YYYY-MM-DD, later than today of the location. Empty means now.',
  })
  @IsOptional()
  @IsString()
  effectiveDate?: string;
}
