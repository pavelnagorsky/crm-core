import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  Min,
  ValidateNested,
} from 'class-validator';
import { PermissionChangeDto } from './permission-change.dto.js';
export class UpdatePolicyDto {
  @ApiProperty() @IsInt() @Min(0) expectedVersion: number;
  @ApiProperty({ type: [PermissionChangeDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(120)
  @ValidateNested({ each: true })
  @Type(() => PermissionChangeDto)
  changes: PermissionChangeDto[];
}
