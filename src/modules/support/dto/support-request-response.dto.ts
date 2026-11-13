import { ApiProperty } from '@nestjs/swagger';
import { SupportRequestStatus } from '@prisma/client';
import { SupportRequestWithAttachments } from '../interfaces/support-request-with-attachments.interface.js';

export class SupportRequestResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({
    type: String,
    nullable: true,
    format: 'uuid',
    description: 'Author account; null for guests or deleted accounts',
  })
  userId: string | null;

  @ApiProperty({ description: 'Reply address captured at submission time' })
  email: string;

  @ApiProperty({ description: 'Plain text, never render as HTML' })
  message: string;

  @ApiProperty({
    enum: SupportRequestStatus,
    enumName: 'SupportRequestStatus',
  })
  status: SupportRequestStatus;

  @ApiProperty({ type: String, nullable: true })
  notes: string | null;

  @ApiProperty({ type: Date, nullable: true })
  resolvedAt: Date | null;

  @ApiProperty({
    type: String,
    format: 'uuid',
    isArray: true,
    description: 'Attachment ids in the order sent',
  })
  fileIds: string[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  static fromEntity(
    entity: SupportRequestWithAttachments,
  ): SupportRequestResponseDto {
    return Object.assign(new SupportRequestResponseDto(), {
      id: entity.id,
      userId: entity.userId,
      email: entity.email,
      message: entity.message,
      status: entity.status,
      notes: entity.notes,
      resolvedAt: entity.resolvedAt,
      fileIds: entity.attachments.map((attachment) => attachment.id),
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    });
  }
}
