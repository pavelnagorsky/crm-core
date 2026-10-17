import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { ApiResponseArray } from '../../../../shared/dto/api-response-array.dto.js';
import { ApiResponse } from '../../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../../shared/dto/base-response.dto.js';
import { IdResponseDto } from '../../../../shared/dto/id-response.dto.js';
import { XlsxUtils } from '../../../../shared/xlsx/xlsx.utils.js';
import { Permission } from '../../../access/enums/permission.enum.js';
import { assertPermission } from '../../../access/utils/assert-permission.js';
import { auditActorFromToken } from '../../../audit/utils/audit-actor-from-token.js';
import { Permissions } from '../../../auth/decorators/permissions.decorator.js';
import { TokenPayload } from '../../../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../../../auth/dto/token-payload.dto.js';
import { PayrollPeriodEarningsRequestDto } from '../../earnings/dto/payroll-period-earnings-request.dto.js';
import { StaffEarningResponseDto } from '../../earnings/dto/staff-earning-response.dto.js';
import { StaffEarningSearchResponseDto } from '../../earnings/dto/staff-earning-search-response.dto.js';
import { StaffEarningsService } from '../../earnings/services/staff-earnings.service.js';
import { PayrollReportResponseDto } from '../../report/dto/payroll-report-response.dto.js';
import { PayrollReportService } from '../../report/services/payroll-report.service.js';
import { CreatePayrollCorrectionDto } from '../dto/create-payroll-correction.dto.js';
import { CreatePayrollPeriodDto } from '../dto/create-payroll-period.dto.js';
import { LockedPayrollRangeDto } from '../dto/locked-payroll-range.dto.js';
import { PayrollPeriodResponseDto } from '../dto/payroll-period-response.dto.js';
import { PayrollPeriodSearchRequestDto } from '../dto/payroll-period-search-request.dto.js';
import { PayrollPeriodSearchResponseDto } from '../dto/payroll-period-search-response.dto.js';
import { PayrollPeriodStatusCountResponseDto } from '../dto/payroll-period-status-count-response.dto.js';
import { PayrollPeriodService } from '../services/payroll-period.service.js';

@ApiTags('Payroll')
@Controller('locations/:locationId/payroll')
export class PayrollPeriodsController {
  constructor(
    private readonly payroll: PayrollPeriodService,
    private readonly reports: PayrollReportService,
    private readonly earnings: StaffEarningsService,
  ) {}

  @ApiOperation({ summary: 'Create a payroll period' })
  @ApiCreatedResponse({ type: ApiResponse(IdResponseDto) })
  @Permissions(Permission.PAYROLL_MANAGE)
  @Post('periods')
  async create(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: CreatePayrollPeriodDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    const period = await this.payroll.create(
      locationId,
      dto,
      auditActorFromToken(tokenPayload, locationId),
    );
    return BaseResponseDto.success({ id: period.id });
  }

  @ApiOperation({
    summary: 'Date ranges closed for new earnings',
    description:
      'Approved and paid periods. A manual earning whose date falls inside one of these ranges is rejected.',
  })
  @ApiOkResponse({ type: ApiResponseArray(LockedPayrollRangeDto) })
  @Permissions(Permission.PAYROLL_READ)
  @Get('locked-ranges')
  async lockedRanges(
    @Param('locationId', ParseUUIDPipe) locationId: string,
  ): Promise<BaseResponseDto<LockedPayrollRangeDto[]>> {
    const ranges = await this.payroll.listLockedRanges(locationId);
    return BaseResponseDto.success(
      ranges.map(LockedPayrollRangeDto.fromEntity),
    );
  }

  @ApiOperation({ summary: 'Search payroll periods' })
  @ApiOkResponse({ type: ApiResponse(PayrollPeriodSearchResponseDto) })
  @Permissions(Permission.PAYROLL_READ)
  @Get('periods')
  async search(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Query() dto: PayrollPeriodSearchRequestDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<PayrollPeriodSearchResponseDto>> {
    if (dto.isExport)
      assertPermission(tokenPayload, Permission.PAYROLL_EXPORT, locationId);
    const { items, totalItems } = await this.payroll.search(locationId, dto);
    return BaseResponseDto.success(
      new PayrollPeriodSearchResponseDto(
        items.map((item) => PayrollPeriodResponseDto.fromEntity(item)),
        dto.page,
        dto.pageSize,
        totalItems,
        dto.isExport,
      ),
    );
  }

  @ApiOperation({ summary: 'Get payroll period count per status' })
  @ApiOkResponse({
    type: ApiResponseArray(PayrollPeriodStatusCountResponseDto),
  })
  @Permissions(Permission.PAYROLL_READ)
  @Get('periods/status-counts')
  async getStatusCounts(
    @Param('locationId', ParseUUIDPipe) locationId: string,
  ): Promise<BaseResponseDto<PayrollPeriodStatusCountResponseDto[]>> {
    const counts = await this.payroll.getStatusCounts(locationId);
    return BaseResponseDto.success(
      counts.map((r) =>
        Object.assign(new PayrollPeriodStatusCountResponseDto(), r),
      ),
    );
  }

  @ApiOperation({ summary: 'Get payroll period with results' })
  @ApiOkResponse({ type: ApiResponse(PayrollPeriodResponseDto) })
  @ApiNotFoundResponse({ description: 'Payroll period not found' })
  @Permissions(Permission.PAYROLL_READ)
  @Get('periods/:id')
  async findById(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<PayrollPeriodResponseDto>> {
    const period = await this.payroll.findById(id);
    this.assertPeriodInLocation(period, locationId);
    assertPermission(tokenPayload, Permission.PAYROLL_READ, period.locationId);
    return BaseResponseDto.success(PayrollPeriodResponseDto.fromEntity(period));
  }

  @ApiOperation({ summary: 'Payroll report: vedomost + payslips' })
  @ApiOkResponse({ type: ApiResponse(PayrollReportResponseDto) })
  @Permissions(Permission.PAYROLL_READ)
  @Get('periods/:id/report')
  async report(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<PayrollReportResponseDto>> {
    const period = await this.payroll.findById(id);
    this.assertPeriodInLocation(period, locationId);
    assertPermission(tokenPayload, Permission.PAYROLL_READ, period.locationId);
    return BaseResponseDto.success(await this.reports.build(id));
  }

  @ApiOperation({ summary: 'List earnings attached to a payroll period' })
  @ApiOkResponse({ type: ApiResponse(StaffEarningSearchResponseDto) })
  @Permissions(Permission.PAYROLL_READ)
  @Get('periods/:id/earnings')
  async listPeriodEarnings(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: PayrollPeriodEarningsRequestDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<StaffEarningSearchResponseDto>> {
    if (dto.isExport)
      assertPermission(tokenPayload, Permission.PAYROLL_EXPORT, locationId);
    const period = await this.payroll.findById(id);
    this.assertPeriodInLocation(period, locationId);
    assertPermission(tokenPayload, Permission.PAYROLL_READ, period.locationId);
    const { items, totalItems } = await this.earnings.searchByPeriod(id, dto);
    return BaseResponseDto.success(
      new StaffEarningSearchResponseDto(
        items.map(StaffEarningResponseDto.fromEntity),
        dto.page,
        dto.pageSize,
        totalItems,
        dto.isExport,
      ),
    );
  }

  @ApiOperation({ summary: 'Export payment vedomost as XLSX' })
  @ApiProduces(XlsxUtils.mimeType)
  @Permissions(Permission.PAYROLL_EXPORT)
  @Get('periods/:id/export/vedomost')
  async exportVedomost(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @TokenPayload() tokenPayload: TokenPayloadDto,
    @Res({ passthrough: true })
    res: { setHeader: (name: string, value: string) => void },
  ): Promise<StreamableFile> {
    const period = await this.payroll.findById(id);
    this.assertPeriodInLocation(period, locationId);
    assertPermission(
      tokenPayload,
      Permission.PAYROLL_EXPORT,
      period.locationId,
    );
    const { stream, filename } = await this.reports.exportVedomost(id);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return new StreamableFile(stream, { type: XlsxUtils.mimeType });
  }

  @ApiOperation({ summary: 'Export payslips as XLSX' })
  @ApiProduces(XlsxUtils.mimeType)
  @Permissions(Permission.PAYROLL_EXPORT)
  @Get('periods/:id/export/payslips')
  async exportPayslips(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @TokenPayload() tokenPayload: TokenPayloadDto,
    @Res({ passthrough: true })
    res: { setHeader: (name: string, value: string) => void },
  ): Promise<StreamableFile> {
    const period = await this.payroll.findById(id);
    this.assertPeriodInLocation(period, locationId);
    assertPermission(
      tokenPayload,
      Permission.PAYROLL_EXPORT,
      period.locationId,
    );
    const { stream, filename } = await this.reports.exportPayslips(id);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return new StreamableFile(stream, { type: XlsxUtils.mimeType });
  }

  @ApiOperation({ summary: 'Calculate or recalculate a payroll period' })
  @ApiOkResponse({ type: ApiResponse(IdResponseDto) })
  @Permissions(Permission.PAYROLL_MANAGE)
  @Post('periods/:id/calculate')
  @HttpCode(HttpStatus.OK)
  async calculate(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    const period = await this.payroll.findById(id);
    this.assertPeriodInLocation(period, locationId);
    assertPermission(
      tokenPayload,
      Permission.PAYROLL_MANAGE,
      period.locationId,
    );
    const updated = await this.payroll.calculate(
      id,
      auditActorFromToken(tokenPayload, period.locationId),
    );
    return BaseResponseDto.success({ id: updated.id });
  }

  @ApiOperation({ summary: 'Approve a calculated payroll period' })
  @ApiOkResponse({ type: ApiResponse(IdResponseDto) })
  @Permissions(Permission.PAYROLL_MANAGE)
  @Post('periods/:id/approve')
  @HttpCode(HttpStatus.OK)
  async approve(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    const period = await this.payroll.findById(id);
    this.assertPeriodInLocation(period, locationId);
    assertPermission(
      tokenPayload,
      Permission.PAYROLL_MANAGE,
      period.locationId,
    );
    const updated = await this.payroll.approve(
      id,
      auditActorFromToken(tokenPayload, period.locationId),
    );
    return BaseResponseDto.success({ id: updated.id });
  }

  @ApiOperation({ summary: 'Mark an approved payroll period as paid' })
  @ApiOkResponse({ type: ApiResponse(IdResponseDto) })
  @Permissions(Permission.PAYROLL_MANAGE)
  @Post('periods/:id/pay')
  @HttpCode(HttpStatus.OK)
  async pay(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    const period = await this.payroll.findById(id);
    this.assertPeriodInLocation(period, locationId);
    assertPermission(
      tokenPayload,
      Permission.PAYROLL_MANAGE,
      period.locationId,
    );
    const updated = await this.payroll.pay(
      id,
      auditActorFromToken(tokenPayload, period.locationId),
    );
    return BaseResponseDto.success({ id: updated.id });
  }

  @ApiOperation({ summary: 'Delete a draft or calculated payroll period' })
  @ApiNoContentResponse()
  @Permissions(Permission.PAYROLL_MANAGE)
  @Delete('periods/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<void> {
    const period = await this.payroll.findById(id);
    this.assertPeriodInLocation(period, locationId);
    assertPermission(
      tokenPayload,
      Permission.PAYROLL_MANAGE,
      period.locationId,
    );
    await this.payroll.delete(
      id,
      auditActorFromToken(tokenPayload, period.locationId),
    );
  }

  @ApiOperation({
    summary: 'Add a post-approval correction; it lands in the next open period',
  })
  @ApiCreatedResponse({ type: ApiResponse(IdResponseDto) })
  @Permissions(Permission.PAYROLL_MANAGE)
  @Post('results/:id/corrections')
  async correct(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePayrollCorrectionDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    const result = await this.payroll.findResultById(id);
    this.assertResultInLocation(result, locationId);
    assertPermission(
      tokenPayload,
      Permission.PAYROLL_MANAGE,
      result.locationId,
    );
    const earning = await this.payroll.correct(
      id,
      dto,
      auditActorFromToken(tokenPayload, result.locationId),
    );
    return BaseResponseDto.success({ id: earning.id });
  }

  private assertPeriodInLocation(
    period: { locationId: string },
    locationId: string,
  ): void {
    if (period.locationId !== locationId) {
      throw new NotFoundException('Payroll period not found');
    }
  }

  private assertResultInLocation(
    result: { locationId: string },
    locationId: string,
  ): void {
    if (result.locationId !== locationId) {
      throw new NotFoundException('Payroll result not found');
    }
  }
}
