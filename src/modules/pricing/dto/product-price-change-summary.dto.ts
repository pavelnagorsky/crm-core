import { ApiProperty } from '@nestjs/swagger';
import { PriceChangeSource, PriceChangeStatus } from '@prisma/client';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { PriceChangeSummaryView } from '../interfaces/price-change-summary-view.interface.js';
import { ProductPriceChangeRuleSpecDto } from './product-price-change-rule-spec.dto.js';
import { ServicePriceChangeAuthorDto } from './service-price-change-author.dto.js';

export class ProductPriceChangeSummaryDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id: string;

  @ApiProperty({ enum: PriceChangeSource, enumName: 'PriceChangeSource' })
  source: PriceChangeSource;

  @ApiProperty({ enum: PriceChangeStatus, enumName: 'PriceChangeStatus' })
  status: PriceChangeStatus;

  @ApiProperty({ type: String })
  title: string;

  @ApiProperty({ type: String, example: '2027-01-01' })
  effectiveDate: string;

  @ApiProperty({ type: () => ProductPriceChangeRuleSpecDto, nullable: true })
  ruleSpec: ProductPriceChangeRuleSpecDto | null;

  @ApiProperty({ type: String, nullable: true })
  fileName: string | null;

  @ApiProperty({ type: Number })
  productsCount: number;

  @ApiProperty({ type: Number })
  itemsCount: number;

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

  static fromView(view: PriceChangeSummaryView): ProductPriceChangeSummaryDto {
    return ProductPriceChangeSummaryDto.fill(new ProductPriceChangeSummaryDto(), view);
  }

  protected static fill<T extends ProductPriceChangeSummaryDto>(
    dto: T,
    { change, createdBy }: PriceChangeSummaryView,
  ): T {
    dto.id = change.id;
    dto.source = change.source;
    dto.status = change.status;
    dto.title = change.title;
    dto.effectiveDate = TimeUtils.dateOnlyStr(change.effectiveDate);
    dto.ruleSpec = change.ruleSpec as ProductPriceChangeRuleSpecDto | null;
    dto.fileName = change.fileName;
    dto.productsCount = change.productsCount;
    dto.itemsCount = change.itemsCount;
    dto.applySkippedCount = change.applySkippedCount;
    dto.rollbackSkippedCount = change.rollbackSkippedCount;
    dto.createdBy = createdBy;
    dto.createdAt = change.createdAt.toISOString();
    dto.appliedAt = change.appliedAt?.toISOString() ?? null;
    dto.cancelledAt = change.cancelledAt?.toISOString() ?? null;
    dto.rolledBackAt = change.rolledBackAt?.toISOString() ?? null;
    dto.canCancel = change.status === PriceChangeStatus.SCHEDULED;
    dto.canRollback = change.status === PriceChangeStatus.APPLIED;
    return dto;
  }
}
