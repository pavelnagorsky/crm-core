import { ApiProperty } from '@nestjs/swagger';
import { AccessPolicyEntryDto } from './access-policy-entry.dto.js';
export class AccessPolicyResponseDto {
  @ApiProperty() version: number;
  @ApiProperty({ type: [AccessPolicyEntryDto] })
  entries: AccessPolicyEntryDto[];
}
