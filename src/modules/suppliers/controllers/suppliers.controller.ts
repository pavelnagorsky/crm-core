import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Claim } from '../../access/enums/claim.enum.js';
import { Read, Write } from '../../access/utils/permission.js';
import { ApiResponseArray } from '../../../shared/dto/api-response-array.dto.js';
import { ApiResponse } from '../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../shared/dto/base-response.dto.js';
import { IdResponseDto } from '../../../shared/dto/id-response.dto.js';
import { Permissions } from '../../auth/decorators/permissions.decorator.js';
import { CreateSupplierDto } from '../dto/create-supplier.dto.js';
import { SupplierOptionDto } from '../dto/supplier-option.dto.js';
import { SupplierOptionsRequestDto } from '../dto/supplier-options-request.dto.js';
import { SupplierResponseDto } from '../dto/supplier-response.dto.js';
import { SupplierSearchRequestDto } from '../dto/supplier-search-request.dto.js';
import { SupplierSearchResponseDto } from '../dto/supplier-search-response.dto.js';
import { UpdateSupplierDto } from '../dto/update-supplier.dto.js';
import { SuppliersService } from '../services/suppliers.service.js';

@ApiTags('Suppliers')
@Controller('brands/:brandId/suppliers')
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @ApiOperation({ summary: 'Create a supplier' })
  @ApiCreatedResponse({ type: ApiResponse(IdResponseDto) })
  @ApiConflictResponse({ description: 'Supplier name already exists' })
  @Permissions(Write(Claim.SUPPLIER))
  @Post()
  async create(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Body() dto: CreateSupplierDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    const supplier = await this.suppliers.create(brandId, dto);
    return BaseResponseDto.success({ id: supplier.id });
  }

  @ApiOperation({ summary: 'Search suppliers' })
  @ApiOkResponse({ type: ApiResponse(SupplierSearchResponseDto) })
  @Permissions(Read(Claim.SUPPLIER))
  @Get()
  async search(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Query() dto: SupplierSearchRequestDto,
  ): Promise<BaseResponseDto<SupplierSearchResponseDto>> {
    const { items, totalItems } = await this.suppliers.search(brandId, dto);
    return BaseResponseDto.success(
      new SupplierSearchResponseDto(
        items.map(SupplierResponseDto.fromEntity),
        dto.page,
        dto.pageSize,
        totalItems,
        dto.isExport,
      ),
    );
  }

  @ApiOperation({ summary: 'List active supplier options' })
  @ApiOkResponse({ type: ApiResponseArray(SupplierOptionDto) })
  @Permissions(Read(Claim.SUPPLIER))
  @Get('options')
  async listOptions(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Query() dto: SupplierOptionsRequestDto,
  ): Promise<BaseResponseDto<SupplierOptionDto[]>> {
    const items = await this.suppliers.listOptions(brandId, dto);
    return BaseResponseDto.success(items.map(SupplierOptionDto.fromEntity));
  }

  @ApiOperation({ summary: 'Get supplier details' })
  @ApiOkResponse({ type: ApiResponse(SupplierResponseDto) })
  @ApiNotFoundResponse({ description: 'Supplier not found' })
  @Permissions(Read(Claim.SUPPLIER))
  @Get(':supplierId')
  async findById(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
  ): Promise<BaseResponseDto<SupplierResponseDto>> {
    return BaseResponseDto.success(
      SupplierResponseDto.fromEntity(
        await this.suppliers.findByIdInBrand(brandId, supplierId),
      ),
    );
  }

  @ApiOperation({ summary: 'Update supplier' })
  @ApiOkResponse({ type: ApiResponse(IdResponseDto) })
  @ApiConflictResponse({ description: 'Supplier name already exists' })
  @ApiNotFoundResponse({ description: 'Supplier not found' })
  @Permissions(Write(Claim.SUPPLIER))
  @Put(':supplierId')
  async update(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @Body() dto: UpdateSupplierDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    const supplier = await this.suppliers.update(brandId, supplierId, dto);
    return BaseResponseDto.success({ id: supplier.id });
  }

  @ApiOperation({ summary: 'Deactivate supplier' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'Supplier not found' })
  @Permissions(Write(Claim.SUPPLIER))
  @Delete(':supplierId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deactivate(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
  ): Promise<void> {
    await this.suppliers.deactivate(brandId, supplierId);
  }
}
