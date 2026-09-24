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
import { BusinessRole } from '@prisma/client';
import { Auth } from '../../auth/decorators/auth.decorator.js';
import { TokenPayload } from '../../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto, assertBusinessRole } from '../../auth/dto/token-payload.dto.js';
import { auditActorFromToken } from '../../audit/utils/audit-actor-from-token.js';
import { ApiResponse, BaseResponseDto } from '../../../shared/dto/base-response.dto.js';
import { CreatePayrollCorrectionDto } from './dto/create-payroll-correction.dto.js';
import { CreatePayrollPeriodDto } from './dto/create-payroll-period.dto.js';
import { PayrollPeriodResponseDto } from './dto/payroll-period-response.dto.js';
import { PayrollPeriodSearchRequestDto } from './dto/payroll-period-search-request.dto.js';
import { PayrollPeriodSearchResponseDto } from './dto/payroll-period-search-response.dto.js';
import { PayrollReportResponseDto } from '../report/dto/payroll-report-response.dto.js';
import { StaffEarningResponseDto } from '../earnings/dto/staff-earning-response.dto.js';
import { PayrollReportService } from '../report/payroll-report.service.js';
import { PayrollService } from './payroll.service.js';

@ApiTags('Payroll')
@Controller('payroll')
export class PayrollController {
  constructor(
    private readonly payroll: PayrollService,
    private readonly reports: PayrollReportService,
  ) {}

  @ApiOperation({ summary: 'Create a payroll period' })
  @ApiCreatedResponse({ type: ApiResponse(PayrollPeriodResponseDto) })
  @Auth()
  @Post('periods')
  async create(
    @Body() dto: CreatePayrollPeriodDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<PayrollPeriodResponseDto>> {
    assertBusinessRole(tokenPayload, dto.businessId, BusinessRole.OWNER);
    const period = await this.payroll.create(dto, auditActorFromToken(tokenPayload, dto.businessId));
    return BaseResponseDto.success(PayrollPeriodResponseDto.fromEntity(period));
  }

  @ApiOperation({ summary: 'Search payroll periods' })
  @ApiOkResponse({ type: ApiResponse(PayrollPeriodSearchResponseDto) })
  @Auth()
  @Get('periods')
  async search(
    @Query() dto: PayrollPeriodSearchRequestDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<PayrollPeriodSearchResponseDto>> {
    assertBusinessRole(tokenPayload, dto.businessId, BusinessRole.OWNER, BusinessRole.STAFF);
    const { items, totalItems } = await this.payroll.search(dto.businessId, dto);
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

  @ApiOperation({ summary: 'Get payroll period with results' })
  @ApiOkResponse({ type: ApiResponse(PayrollPeriodResponseDto) })
  @ApiNotFoundResponse({ description: 'Payroll period not found' })
  @Auth()
  @Get('periods/:id')
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<PayrollPeriodResponseDto>> {
    const period = await this.payroll.findById(id);
    assertBusinessRole(tokenPayload, period.businessId, BusinessRole.OWNER, BusinessRole.STAFF);
    return BaseResponseDto.success(PayrollPeriodResponseDto.fromEntity(period));
  }

  @ApiOperation({ summary: 'Payroll report: vedomost + payslips' })
  @ApiOkResponse({ type: ApiResponse(PayrollReportResponseDto) })
  @Auth()
  @Get('periods/:id/report')
  async report(
    @Param('id', ParseUUIDPipe) id: string,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<PayrollReportResponseDto>> {
    const period = await this.payroll.findById(id);
    assertBusinessRole(tokenPayload, period.businessId, BusinessRole.OWNER, BusinessRole.STAFF);
    return BaseResponseDto.success(await this.reports.build(id));
  }

  @ApiOperation({ summary: 'Export payment vedomost as XLSX' })
  @ApiProduces('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Auth()
  @Get('periods/:id/export/vedomost')
  async exportVedomost(
    @Param('id', ParseUUIDPipe) id: string,
    @TokenPayload() tokenPayload: TokenPayloadDto,
    @Res({ passthrough: true }) res: { setHeader: (name: string, value: string) => void },
  ): Promise<StreamableFile> {
    const period = await this.payroll.findById(id);
    assertBusinessRole(tokenPayload, period.businessId, BusinessRole.OWNER, BusinessRole.STAFF);
    const { stream, filename } = await this.reports.exportVedomost(id);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return new StreamableFile(stream, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  @ApiOperation({ summary: 'Export payslips as XLSX' })
  @ApiProduces('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Auth()
  @Get('periods/:id/export/payslips')
  async exportPayslips(
    @Param('id', ParseUUIDPipe) id: string,
    @TokenPayload() tokenPayload: TokenPayloadDto,
    @Res({ passthrough: true }) res: { setHeader: (name: string, value: string) => void },
  ): Promise<StreamableFile> {
    const period = await this.payroll.findById(id);
    assertBusinessRole(tokenPayload, period.businessId, BusinessRole.OWNER, BusinessRole.STAFF);
    const { stream, filename } = await this.reports.exportPayslips(id);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return new StreamableFile(stream, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  @ApiOperation({ summary: 'Calculate or recalculate a payroll period' })
  @ApiOkResponse({ type: ApiResponse(PayrollPeriodResponseDto) })
  @Auth()
  @Post('periods/:id/calculate')
  @HttpCode(HttpStatus.OK)
  async calculate(
    @Param('id', ParseUUIDPipe) id: string,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<PayrollPeriodResponseDto>> {
    const period = await this.payroll.findById(id);
    assertBusinessRole(tokenPayload, period.businessId, BusinessRole.OWNER);
    const updated = await this.payroll.calculate(id, auditActorFromToken(tokenPayload, period.businessId));
    return BaseResponseDto.success(PayrollPeriodResponseDto.fromEntity(updated));
  }

  @ApiOperation({ summary: 'Approve a calculated payroll period' })
  @ApiOkResponse({ type: ApiResponse(PayrollPeriodResponseDto) })
  @Auth()
  @Post('periods/:id/approve')
  @HttpCode(HttpStatus.OK)
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<PayrollPeriodResponseDto>> {
    const period = await this.payroll.findById(id);
    assertBusinessRole(tokenPayload, period.businessId, BusinessRole.OWNER);
    const updated = await this.payroll.approve(id, auditActorFromToken(tokenPayload, period.businessId));
    return BaseResponseDto.success(PayrollPeriodResponseDto.fromEntity(updated));
  }

  @ApiOperation({ summary: 'Mark an approved payroll period as paid' })
  @ApiOkResponse({ type: ApiResponse(PayrollPeriodResponseDto) })
  @Auth()
  @Post('periods/:id/pay')
  @HttpCode(HttpStatus.OK)
  async pay(
    @Param('id', ParseUUIDPipe) id: string,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<PayrollPeriodResponseDto>> {
    const period = await this.payroll.findById(id);
    assertBusinessRole(tokenPayload, period.businessId, BusinessRole.OWNER);
    const updated = await this.payroll.pay(id, auditActorFromToken(tokenPayload, period.businessId));
    return BaseResponseDto.success(PayrollPeriodResponseDto.fromEntity(updated));
  }

  @ApiOperation({ summary: 'Delete a draft or calculated payroll period' })
  @ApiNoContentResponse()
  @Auth()
  @Delete('periods/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('id', ParseUUIDPipe) id: string,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<void> {
    const period = await this.payroll.findById(id);
    assertBusinessRole(tokenPayload, period.businessId, BusinessRole.OWNER);
    await this.payroll.delete(id, auditActorFromToken(tokenPayload, period.businessId));
  }

  @ApiOperation({ summary: 'Add a post-approval correction; it lands in the next open period' })
  @ApiCreatedResponse({ type: ApiResponse(StaffEarningResponseDto) })
  @Auth()
  @Post('results/:id/corrections')
  async correct(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePayrollCorrectionDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<StaffEarningResponseDto>> {
    const result = await this.payroll.findResultById(id);
    assertBusinessRole(tokenPayload, result.businessId, BusinessRole.OWNER);
    const earning = await this.payroll.correct(id, dto, auditActorFromToken(tokenPayload, result.businessId));
    return BaseResponseDto.success(StaffEarningResponseDto.fromEntity(earning));
  }
}
