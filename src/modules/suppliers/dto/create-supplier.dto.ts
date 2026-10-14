import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSupplierDto {
  @ApiProperty({ type: String, maxLength: 200 })
  @IsString()
  @MaxLength(200)
  name: string;

  @ApiProperty({
    type: String,
    maxLength: 255,
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  legalName?: string | null;

  @ApiProperty({ type: String, maxLength: 30, required: false, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  taxId?: string | null;

  @ApiProperty({ type: String, maxLength: 30, required: false, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string | null;

  @ApiProperty({
    type: String,
    maxLength: 254,
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string | null;

  @ApiProperty({
    type: String,
    maxLength: 150,
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  contactPerson?: string | null;

  @ApiProperty({
    type: String,
    maxLength: 1000,
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string | null;
}
