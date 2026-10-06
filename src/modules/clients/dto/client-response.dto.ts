import { ApiProperty } from '@nestjs/swagger';
import { Client } from '@prisma/client';

export class ClientResponseDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  brandId: string;

  @ApiProperty({ type: String, nullable: true })
  userId: string | null;

  @ApiProperty({ type: String })
  firstName: string;

  @ApiProperty({ type: String })
  lastName: string;

  @ApiProperty({ type: String })
  phone: string;

  @ApiProperty({ type: String, nullable: true })
  email: string | null;

  @ApiProperty({ type: Date, nullable: true })
  birthDate: Date | null;

  @ApiProperty({ type: String, nullable: true })
  gender: string | null;

  @ApiProperty({ type: String, nullable: true })
  notes: string | null;

  @ApiProperty({ type: Date, nullable: true })
  bannedAt: Date | null;

  @ApiProperty({ type: String, nullable: true })
  banReason: string | null;

  @ApiProperty({ type: Date })
  createdAt: Date;

  @ApiProperty({ type: Date })
  updatedAt: Date;

  static fromEntity(client: Client): ClientResponseDto {
    const dto = new ClientResponseDto();
    dto.id = client.id;
    dto.brandId = client.brandId;
    dto.userId = client.userId;
    dto.firstName = client.firstName;
    dto.lastName = client.lastName;
    dto.phone = client.phone;
    dto.email = client.email;
    dto.birthDate = client.birthDate;
    dto.gender = client.gender;
    dto.notes = client.notes;
    dto.bannedAt = client.bannedAt;
    dto.banReason = client.banReason;
    dto.createdAt = client.createdAt;
    dto.updatedAt = client.updatedAt;
    return dto;
  }
}
