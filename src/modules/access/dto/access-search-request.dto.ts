import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { PaginationRequestDto } from '../../../shared/dto/pagination-request.dto.js';
export class AccessSearchRequestDto extends PaginationRequestDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() locationId?: string;
}
