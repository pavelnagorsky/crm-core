import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiResponse } from '../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../shared/dto/base-response.dto.js';
import { Auth } from '../../auth/decorators/auth.decorator.js';
import { PlatformAdminGuard } from '../../auth/guards/platform-admin.guard.js';
import { SupportRequestDetailsResponseDto } from '../dto/support-request-details-response.dto.js';
import { SupportRequestResponseDto } from '../dto/support-request-response.dto.js';
import { SupportRequestSearchRequestDto } from '../dto/support-request-search-request.dto.js';
import { SupportRequestSearchResponseDto } from '../dto/support-request-search-response.dto.js';
import { UpdateSupportRequestDto } from '../dto/update-support-request.dto.js';
import { SupportService } from '../services/support.service.js';

@ApiTags('Support administration')
@Controller('admin/support-requests')
@UseGuards(PlatformAdminGuard)
@Auth()
@ApiForbiddenResponse({
  description: 'Only platform administrators can manage support requests',
})
export class AdminSupportController {
  constructor(private readonly supportService: SupportService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Search support requests, filter by status, paginate and sort; newest first by default',
  })
  @ApiOkResponse({ type: ApiResponse(SupportRequestSearchResponseDto) })
  async search(
    @Query() dto: SupportRequestSearchRequestDto,
  ): Promise<BaseResponseDto<SupportRequestSearchResponseDto>> {
    const { items, totalItems } = await this.supportService.search(dto);
    return BaseResponseDto.success(
      new SupportRequestSearchResponseDto(
        items.map(SupportRequestResponseDto.fromEntity),
        dto.page,
        dto.pageSize,
        totalItems,
        dto.isExport,
      ),
    );
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Get a support request with attachments and internal notes',
  })
  @ApiOkResponse({ type: ApiResponse(SupportRequestDetailsResponseDto) })
  @ApiNotFoundResponse({ description: 'Support request not found' })
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BaseResponseDto<SupportRequestDetailsResponseDto>> {
    return BaseResponseDto.success(
      SupportRequestDetailsResponseDto.fromDetails(
        await this.supportService.findDetails(id),
      ),
    );
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Change status and/or replace internal notes; null clears notes; any status can be reopened. resolvedAt is set on RESOLVED and cleared on any other status',
  })
  @ApiOkResponse({ type: ApiResponse(SupportRequestResponseDto) })
  @ApiNotFoundResponse({ description: 'Support request not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupportRequestDto,
  ): Promise<BaseResponseDto<SupportRequestResponseDto>> {
    return BaseResponseDto.success(
      SupportRequestResponseDto.fromEntity(
        await this.supportService.update(id, dto),
      ),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Permanently delete a support request together with its attachments',
  })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'Support request not found' })
  async delete(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.supportService.delete(id);
  }
}
