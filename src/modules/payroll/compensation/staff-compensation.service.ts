import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from '../../../database/database.service.js';
import { PrismaErrorCode } from '../../../shared/database/prisma-error-codes.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { AUDIT_EVENT } from '../../audit/audit.constants.js';
import { AuditActionType } from '../../audit/enums/audit-action-type.enum.js';
import { AuditEntity } from '../../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../../audit/enums/audit-event.enum.js';
import { AuditActor } from '../../audit/interfaces/audit-actor.interface.js';
import { AuditLogEvent } from '../../audit/interfaces/audit-log-event.interface.js';
import { BusinessService } from '../../business/business.service.js';
import { ServicesService } from '../../services/services.service.js';
import { StaffService } from '../../staff/staff.service.js';
import { TimeService } from '../../time/time.service.js';
import { CompensationSalaryMode } from './enums/compensation-salary-mode.enum.js';
import { ReplaceCompensationPlanDto } from './dto/replace-compensation-plan.dto.js';
import { assertCompensationVersionStart } from './compensation-plan.rules.js';
import { CompensationPlanWithRates } from './interfaces/compensation-plan-with-rates.interface.js';
import { dateOnly } from '../utils/money.js';

@Injectable()
export class StaffCompensationService {
  constructor(
    private readonly db: DatabaseService,
    private readonly staffService: StaffService,
    private readonly servicesService: ServicesService,
    private readonly businessService: BusinessService,
    private readonly time: TimeService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async listHistory(staffId: string): Promise<CompensationPlanWithRates[]> {
    const staff = await this.staffService.findById(staffId);
    return this.db.staffCompensationPlan.findMany({
      where: { staffId: staff.id },
      include: { serviceRates: true },
      orderBy: { effectiveFrom: 'desc' },
    });
  }

  async findCurrent(staffId: string): Promise<CompensationPlanWithRates | null> {
    const staff = await this.staffService.findById(staffId);
    const { timezone } = await this.businessService.getLocale(staff.businessId);
    return this.resolveForDate(staff.id, dateOnly(this.time.zonedDateStr(new Date(), timezone)));
  }

  async resolveForDate(staffId: string, onDate: Date): Promise<CompensationPlanWithRates | null> {
    const day = dateOnly(this.time.dateOnlyStr(onDate));
    return this.db.staffCompensationPlan.findFirst({
      where: {
        staffId,
        effectiveFrom: { lte: day },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: day } }],
      },
      include: { serviceRates: true },
      orderBy: { effectiveFrom: 'desc' },
    });
  }

  async listOverlapping(staffIds: string[], from: Date, to: Date): Promise<CompensationPlanWithRates[]> {
    if (staffIds.length === 0) return [];
    return this.db.staffCompensationPlan.findMany({
      where: {
        staffId: { in: staffIds },
        effectiveFrom: { lte: to },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: from } }],
      },
      include: { serviceRates: true },
      orderBy: { effectiveFrom: 'asc' },
    });
  }

  resolveServicePercent(plan: CompensationPlanWithRates, serviceId: string): string | null {
    const override = plan.serviceRates.find((rate) => rate.serviceId === serviceId);
    if (override) return override.commissionPercent.toString();
    if (plan.serviceCommissionPercent !== null) return plan.serviceCommissionPercent.toString();
    return null;
  }

  async replace(staffId: string, dto: ReplaceCompensationPlanDto, actor: AuditActor): Promise<CompensationPlanWithRates> {
    const staff = await this.staffService.findById(staffId);
    const serviceIds = (dto.serviceRates ?? []).map((rate) => rate.serviceId);
    await this.servicesService.assertIdsInBusiness(staff.businessId, serviceIds);

    const effectiveFrom = dateOnly(dto.effectiveFrom);
    const previousDay = dateOnly(this.time.addDaysStr(dto.effectiveFrom, -1));

    const latest = await this.db.staffCompensationPlan.findFirst({
      where: { staffId },
      include: { serviceRates: true },
      orderBy: { effectiveFrom: 'desc' },
    });

    assertCompensationVersionStart(latest, effectiveFrom);
    const serviceRates = this.nextServiceRates(dto, latest);

    const plan = await this.db.$transaction(async (tx) => {
      if (latest && latest.effectiveTo === null) {
        await tx.staffCompensationPlan.update({
          where: { id: latest.id },
          data: { effectiveTo: previousDay },
        });
      }

      try {
        return await tx.staffCompensationPlan.create({
          data: {
            businessId: staff.businessId,
            staffId,
            effectiveFrom,
            fixedSalaryAmount: dto.fixedSalaryAmount ?? null,
            hourlyRate: dto.hourlyRate ?? null,
            serviceCommissionPercent: dto.serviceCommissionPercent ?? null,
            productCommissionPercent: dto.productCommissionPercent ?? null,
            salaryMode: dto.salaryMode ?? CompensationSalaryMode.GUARANTEED_MINIMUM,
            note: dto.note ?? null,
            serviceRates: serviceRates.length
              ? { create: serviceRates.map((rate) => ({ serviceId: rate.serviceId, commissionPercent: rate.commissionPercent })) }
              : undefined,
          },
          include: { serviceRates: true },
        });
      } catch (e: any) {
        if (e?.code === PrismaErrorCode.UNIQUE_CONSTRAINT_VIOLATION) {
          throw new AppException(ErrorCode.COMPENSATION_PLAN_EFFECTIVE_FROM_INVALID, HttpStatus.CONFLICT);
        }
        throw e;
      }
    });

    const { currency } = await this.businessService.getLocale(staff.businessId);
    const event: AuditLogEvent = {
      businessId: staff.businessId,
      entityType: AuditEntity.STAFF,
      entityId: staffId,
      eventType: AuditEvent.STAFF_COMPENSATION_UPDATED,
      actionType: AuditActionType.MODIFY,
      occurredAt: new Date(),
      actor,
      payload: {
        effectiveFrom: dto.effectiveFrom,
        serviceCommissionPercent: dto.serviceCommissionPercent ?? null,
        productCommissionPercent: dto.productCommissionPercent ?? null,
        fixedSalaryAmount: dto.fixedSalaryAmount ?? null,
        hourlyRate: dto.hourlyRate ?? null,
        salaryMode: plan.salaryMode,
        currency,
      },
    };
    this.eventEmitter.emit(AUDIT_EVENT, event);
    return plan;
  }

  private nextServiceRates(
    dto: ReplaceCompensationPlanDto,
    latest: CompensationPlanWithRates | null,
  ): { serviceId: string; commissionPercent: string }[] {
    if (dto.serviceRates) return dto.serviceRates;
    return (
      latest?.serviceRates.map((rate) => ({
        serviceId: rate.serviceId,
        commissionPercent: rate.commissionPercent.toString(),
      })) ?? []
    );
  }
}
