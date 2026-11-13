import { ApiProperty } from '@nestjs/swagger';
import { PrivateFileResponseDto } from '../../files/dto/private-file-response.dto.js';
import { SupportRequestDetails } from '../interfaces/support-request-details.interface.js';
import { SupportRequestResponseDto } from './support-request-response.dto.js';

export class SupportRequestDetailsResponseDto extends SupportRequestResponseDto {
  @ApiProperty({
    type: () => PrivateFileResponseDto,
    isArray: true,
    description: 'Attachments in the order sent, with signed links',
  })
  files: PrivateFileResponseDto[];

  static fromDetails({
    request,
    files,
  }: SupportRequestDetails): SupportRequestDetailsResponseDto {
    return Object.assign(
      new SupportRequestDetailsResponseDto(),
      SupportRequestResponseDto.fromEntity(request),
      { files: files.map(PrivateFileResponseDto.fromSigned) },
    );
  }
}
