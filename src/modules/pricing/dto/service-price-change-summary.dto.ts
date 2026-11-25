import { ApiProperty } from '@nestjs/swagger';
import {
  ServicePriceChangeSource,
  ServicePriceChangeStatus,
} from '@prisma/client';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { ServicePriceChangeSummaryView } from '../interfaces/service-price-change-summary-view.interface.js';
import { ServicePriceChangeAuthorDto } from './service-price-change-author.dto.js';
import { ServicePriceChangeRuleSpecDto } from './service-price-change-rule-spec.dto.js';

export class ServicePriceChangeSummaryDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id: string;

  @ApiProperty({
    enum: ServicePriceChangeSource,
    enumName: 'ServicePriceChangeSource',
  })
  source: ServicePriceChangeSource;

  @ApiProperty({
    enum: ServicePriceChangeStatus,
    enumName: 'ServicePriceChangeStatus',
  })
  status: ServicePriceChangeStatus;

  @ApiProperty({ type: String })
  title: string;

  @ApiProperty({ type: String, example: '2027-01-01' })
  effectiveDate: string;

  @ApiProperty({ type: () => ServicePriceChangeRuleSpecDto, nullable: true })
  ruleSpec: ServicePriceChangeRuleSpecDto | null;

  @ApiProperty({ type: String, nullable: true })
  fileName: string | null;

  @ApiProperty({ type: Number })
  servicesCount: number;

  @ApiProperty({ type: Number })
  bundlesCount: number;

  @ApiProperty({ type: Number })
  itemsCount: number;

  @ApiProperty({ type: Number })
  createdServicesCount: number;

  @ApiProperty({ type: Number })
  applySkippedCount: number;

  @ApiProperty({ type: Number })
  rollbackSkippedCount: number;

  @ApiProperty({ type: () => ServicePriceChangeAuthorDto, nullable: true })
  createdBy: ServicePriceChangeAuthorDto | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  appliedAt: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  cancelledAt: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  rolledBackAt: string | null;

  @ApiProperty({ type: Boolean, description: 'SCHEDULED.' })
  canCancel: boolean;

  @ApiProperty({ type: Boolean, description: 'APPLIED.' })
  canRollback: boolean;

  static fromView({
    change,
    createdBy,
  }: ServicePriceChangeSummaryView): ServicePriceChangeSummaryDto {
    const dto = new ServicePriceChangeSummaryDto();
    dto.id = change.id;
    dto.source = change.source;
    dto.status = change.status;
    dto.title = change.title;
    dto.effectiveDate = TimeUtils.dateOnlyStr(change.effectiveDate);
    dto.ruleSpec = change.ruleSpec as ServicePriceChangeRuleSpecDto | null;
    dto.fileName = change.fileName;
    dto.servicesCount = change.servicesCount;
    dto.bundlesCount = change.bundlesCount;
    dto.itemsCount = change.itemsCount;
    dto.createdServicesCount = change.createdServicesCount;
    dto.applySkippedCount = change.applySkippedCount;
    dto.rollbackSkippedCount = change.rollbackSkippedCount;
    dto.createdBy = createdBy;
    dto.createdAt = change.createdAt.toISOString();
    dto.appliedAt = change.appliedAt?.toISOString() ?? null;
    dto.cancelledAt = change.cancelledAt?.toISOString() ?? null;
    dto.rolledBackAt = change.rolledBackAt?.toISOString() ?? null;
    dto.canCancel = change.status === ServicePriceChangeStatus.SCHEDULED;
    dto.canRollback = change.status === ServicePriceChangeStatus.APPLIED;
    return dto;
  }
}
