import { ApiProperty } from '@nestjs/swagger';
import { SubscriptionState } from '../enums/subscription-state.enum.js';
import { SubscriptionStateItem } from '../interfaces/subscription-state-item.interface.js';

/** Banner and blocking state of one brand of the user. */
export class SubscriptionStateItemDto {
  @ApiProperty({ format: 'uuid' })
  brandId: string;

  @ApiProperty({ enum: SubscriptionState, enumName: 'SubscriptionState' })
  state: SubscriptionState;

  @ApiProperty({
    description:
      'Work is blocked: EXPIRED or SUSPENDED while enforcement is on',
  })
  isBlocked: boolean;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  accessEndsAt: Date | null;

  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    example: '2026-12-13',
    description: 'Last day with access, inclusive, in the brand timezone',
  })
  lastAccessDate: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  graceEndsAt: Date | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Days until access ends (TRIAL, ACTIVE) or until grace ends (PAST_DUE)',
  })
  daysLeft: number | null;

  @ApiProperty({ description: 'Usage is above the limits that apply now' })
  overLimit: boolean;

  @ApiProperty()
  hasPendingPayment: boolean;

  @ApiProperty({ description: 'The user owns the brand and can pay' })
  isOwner: boolean;

  static fromEntity(item: SubscriptionStateItem): SubscriptionStateItemDto {
    return Object.assign(new SubscriptionStateItemDto(), {
      brandId: item.brandId,
      state: item.view.state,
      isBlocked: item.view.isBlocked,
      accessEndsAt: item.view.accessEndsAt,
      lastAccessDate: item.view.lastAccessDate,
      graceEndsAt: item.view.graceEndsAt,
      daysLeft: item.view.daysLeft,
      overLimit: item.overLimit,
      hasPendingPayment: item.hasPendingPayment,
      isOwner: item.isOwner,
    });
  }
}
