import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class ClientImportRequestDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  businessId: string;
}
