import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { InventoryDocumentType } from '../enums/inventory-document-type.enum.js';
import { InventoryDocumentItemDto } from './inventory-document-item.dto.js';

export class CreateInventoryDocumentDto {
  @ApiProperty({
    enum: InventoryDocumentType,
    enumName: 'InventoryDocumentType',
  })
  @IsEnum(InventoryDocumentType)
  type: InventoryDocumentType;

  @ApiProperty({ type: String, format: 'date-time' })
  @IsDateString()
  occurredAt: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  destinationLocationId?: string | null;

  @ApiProperty({
    type: String,
    maxLength: 100,
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string | null;

  @ApiProperty({
    type: String,
    maxLength: 200,
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  supplierName?: string | null;

  @ApiProperty({
    type: String,
    maxLength: 500,
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string | null;

  @ApiProperty({
    type: String,
    maxLength: 1000,
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;

  @ApiProperty({ type: () => InventoryDocumentItemDto, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => InventoryDocumentItemDto)
  items: InventoryDocumentItemDto[];
}
