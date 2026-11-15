import { ApiProperty } from '@nestjs/swagger';
import { BillingPlanPricingMode, BillingPlanStatus } from '@prisma/client';
import { AdminBillingPlan } from '../interfaces/admin-billing-plan.interface.js';
import { BillingPlanPriceDto } from './billing-plan-price.dto.js';

export class AdminBillingPlanDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'team' })
  code: string;

  @ApiProperty({ example: 'Команда' })
  name: string;

  @ApiProperty()
  position: number;

  @ApiProperty({ enum: BillingPlanStatus, enumName: 'BillingPlanStatus' })
  status: BillingPlanStatus;

  @ApiProperty()
  isPublic: boolean;

  @ApiProperty({
    enum: BillingPlanPricingMode,
    enumName: 'BillingPlanPricingMode',
  })
  pricingMode: BillingPlanPricingMode;

  @ApiProperty({ type: Number, nullable: true })
  staffLimit: number | null;

  @ApiProperty({ type: Number, nullable: true })
  locationLimit: number | null;

  @ApiProperty({ description: 'Subscriptions on this plan' })
  subscriptions: number;

  @ApiProperty({
    type: () => BillingPlanPriceDto,
    isArray: true,
    description: 'Versions in force now, one per country and period',
  })
  currentPrices: BillingPlanPriceDto[];

  @ApiProperty({
    type: () => BillingPlanPriceDto,
    isArray: true,
    description: 'Scheduled versions, soonest first',
  })
  upcomingPrices: BillingPlanPriceDto[];

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;

  static fromEntity(value: AdminBillingPlan): AdminBillingPlanDto {
    return AdminBillingPlanDto.fill(new AdminBillingPlanDto(), value);
  }

  protected static fill<T extends AdminBillingPlanDto>(
    dto: T,
    value: AdminBillingPlan,
  ): T {
    const { plan } = value;
    return Object.assign(dto, {
      id: plan.id,
      code: plan.code,
      name: plan.name,
      position: plan.position,
      status: plan.status,
      isPublic: plan.isPublic,
      pricingMode: plan.pricingMode,
      staffLimit: plan.staffLimit,
      locationLimit: plan.locationLimit,
      subscriptions: value.subscriptions,
      currentPrices: value.currentPrices.map(BillingPlanPriceDto.fromEntity),
      upcomingPrices: value.upcomingPrices.map(BillingPlanPriceDto.fromEntity),
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    });
  }
}
