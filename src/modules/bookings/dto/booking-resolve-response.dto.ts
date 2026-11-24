import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { BookingExecutionMode } from '../enums/booking-execution-mode.enum.js';
import { StaffSelectionMode } from '../enums/staff-selection-mode.enum.js';
import { BookingResolveStaffDto } from './booking-resolve-staff.dto.js';
import { BookingServiceStaffDto } from './booking-service-staff.dto.js';
import { BookingResolvedItemDto } from './booking-resolved-item.dto.js';
import { BookingSelectionResolution } from '../interfaces/booking-selection-resolution.interface.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { PromoCodeResultDto } from '../../pricing/dto/promo-code-result.dto.js';

export class BookingResolveResponseDto {
  @ApiProperty({ type: () => BookingServiceStaffDto, isArray: true })
  staffByService: BookingServiceStaffDto[];

  @ApiProperty({
    type: Boolean,
    description:
      'A complete qualified team exists for these assignments. Availability is checked only when startAt is provided.',
  })
  canAssignStaff: boolean;

  @ApiProperty({
    type: () => BookingResolvedItemDto,
    isArray: true,
    description:
      'Concrete team for startAt; empty when no startAt was supplied. This preview does not reserve time.',
  })
  resolvedItems: BookingResolvedItemDto[];

  @ApiProperty({
    type: String,
    isArray: true,
    description:
      'Active service and bundle ids. A shared staff choice filters services and sequential bundles by that member. Parallel bundles remain available when a complete qualified team exists; selecting one requires clearing the shared staff choice.',
  })
  availableServiceIds: string[];

  @ApiProperty({ type: () => BookingResolveStaffDto, isArray: true })
  availableStaff: BookingResolveStaffDto[];

  @ApiProperty({ enum: StaffSelectionMode, enumName: 'StaffSelectionMode' })
  staffSelection: StaffSelectionMode;

  @ApiProperty({ enum: BookingExecutionMode, enumName: 'BookingExecutionMode' })
  executionMode: BookingExecutionMode;

  @ApiProperty({ type: Number })
  totalDuration: number;

  @ApiPrice()
  totalListPrice: string;

  @ApiPrice({
    nullable: true,
    description:
      'Exact total for startAt: the sum of the charged prices of resolvedItems. Null when no startAt was supplied.',
  })
  totalPrice: string | null;

  @ApiProperty({
    type: () => PromoCodeResultDto,
    nullable: true,
    description:
      'What the promo code did to the exact total (startAt); null without a code or startAt.',
  })
  promoCode: PromoCodeResultDto | null;

  static fromResult(
    result: BookingSelectionResolution,
  ): BookingResolveResponseDto {
    return {
      ...result,
      staffByService: result.staffByService.map(
        BookingServiceStaffDto.fromResult,
      ),
      availableStaff: result.availableStaff.map(
        BookingResolveStaffDto.fromResult,
      ),
      totalListPrice: MoneyUtils.format(result.totalListPrice),
      totalPrice:
        result.totalPrice === null
          ? null
          : MoneyUtils.format(result.totalPrice),
      resolvedItems: result.resolvedItems.map(
        BookingResolvedItemDto.fromResult,
      ),
      promoCode: PromoCodeResultDto.fromResult(result.promoCode),
    };
  }
}
