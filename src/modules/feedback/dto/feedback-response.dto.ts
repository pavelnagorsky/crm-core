import { ApiProperty } from '@nestjs/swagger';
import { Feedback, FeedbackStatus } from '@prisma/client';

export class FeedbackResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ type: String, nullable: true })
  company: string | null;

  @ApiProperty({ type: String, nullable: true })
  phone: string | null;

  @ApiProperty({ type: String, nullable: true })
  email: string | null;

  @ApiProperty({ type: String, nullable: true })
  message: string | null;

  @ApiProperty({ enum: FeedbackStatus, enumName: 'FeedbackStatus' })
  status: FeedbackStatus;

  @ApiProperty({ type: String, nullable: true })
  notes: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  static fromEntity(entity: Feedback): FeedbackResponseDto {
    return Object.assign(new FeedbackResponseDto(), {
      id: entity.id,
      name: entity.name,
      company: entity.company,
      phone: entity.phone,
      email: entity.email,
      message: entity.message,
      status: entity.status,
      notes: entity.notes,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    });
  }
}
