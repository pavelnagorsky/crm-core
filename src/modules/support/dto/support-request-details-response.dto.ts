import { ApiProperty } from '@nestjs/swagger';
import { SupportRequestDetails } from '../interfaces/support-request-details.interface.js';
import { SupportAttachmentDto } from './support-attachment.dto.js';
import { SupportRequestResponseDto } from './support-request-response.dto.js';

export class SupportRequestDetailsResponseDto extends SupportRequestResponseDto {
  @ApiProperty({
    type: () => SupportAttachmentDto,
    isArray: true,
    description: 'Private attachments in the order sent, with signed links',
  })
  files: SupportAttachmentDto[];

  static fromDetails({
    request,
    files,
  }: SupportRequestDetails): SupportRequestDetailsResponseDto {
    return Object.assign(
      new SupportRequestDetailsResponseDto(),
      SupportRequestResponseDto.fromEntity(request),
      { files: files.map(SupportAttachmentDto.fromSigned) },
    );
  }
}
