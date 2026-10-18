import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { InvitationGrantDto } from './invitation-grant.dto.js';
export class CreateAccessInvitationDto {
  @ApiProperty({ type: [InvitationGrantDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => InvitationGrantDto)
  grants: InvitationGrantDto[];
}
