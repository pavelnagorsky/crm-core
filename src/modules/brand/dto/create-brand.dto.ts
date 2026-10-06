import { ApiProperty } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateLocationDto } from '../../location/dto/create-location.dto.js';

export class CreateBrandDto {
  @ApiProperty({ type: String, maxLength: 255 })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  logoFileId?: string;

  @ApiProperty({ type: () => CreateLocationDto })
  @ValidateNested()
  @Type(() => CreateLocationDto)
  location: CreateLocationDto;
}
