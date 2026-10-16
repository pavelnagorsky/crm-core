import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { TrimString } from '../../../shared/transforms/trim-string.transform.js';
export class ReplaceOwnerDto {
  @ApiProperty() @IsUUID() previousUserId: string;
  @ApiProperty() @IsUUID() newUserId: string;
  @ApiProperty()
  @IsString()
  @TrimString()
  @MinLength(1)
  @MaxLength(1000)
  reason: string;
}
