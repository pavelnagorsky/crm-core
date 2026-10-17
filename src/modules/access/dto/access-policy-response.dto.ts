import { ApiProperty } from '@nestjs/swagger';
import { AccessPolicyEntryDto } from './access-policy-entry.dto.js';
export class AccessPolicyResponseDto {
  @ApiProperty() version: number;
  @ApiProperty({
    type: [AccessPolicyEntryDto],
    description:
      'User-configurable permissions only; fixed permissions and internal file access are omitted.',
  })
  entries: AccessPolicyEntryDto[];
}
