import { ApiProperty } from '@nestjs/swagger';
import { BusinessType } from '@prisma/client';

export class LocationBusinessTypesResponseDto {
  @ApiProperty({ enum: BusinessType, enumName: 'BusinessType', isArray: true })
  businessTypes: BusinessType[];
}
