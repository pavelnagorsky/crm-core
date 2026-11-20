import { ApiProperty } from '@nestjs/swagger';
import {
  EmailAudience,
  EmailCancelReason,
  EmailDeliveryMode,
  EmailMessage,
  EmailSkipReason,
  EmailStatus,
} from '@prisma/client';
import { EmailRetryBlock } from '../enums/email-retry-block.enum.js';
import { EmailTemplate } from '../enums/email-template.enum.js';
import { EmailMessageLookups } from '../interfaces/email-message-lookups.interface.js';
import {
  emailRetryBlock,
  isEmailCancellable,
} from '../rules/email-actions.rules.js';

/** A delivery log entry in the admin list. */
export class EmailMessageDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: EmailStatus, enumName: 'EmailStatus' })
  status: EmailStatus;

  @ApiProperty({ enum: EmailTemplate, enumName: 'EmailTemplate' })
  template: EmailTemplate;

  @ApiProperty({ enum: EmailAudience, enumName: 'EmailAudience' })
  audience: EmailAudience;

  @ApiProperty({
    enum: EmailDeliveryMode,
    enumName: 'EmailDeliveryMode',
    description: 'DIRECT emails are sent once and their content is not stored',
  })
  deliveryMode: EmailDeliveryMode;

  @ApiProperty()
  recipient: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Known after the first attempt',
  })
  subject: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  brandId: string | null;

  @ApiProperty({ type: String, nullable: true })
  brandName: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  locationId: string | null;

  @ApiProperty({ type: String, nullable: true })
  locationName: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  bookingId: string | null;

  @ApiProperty({ type: Number, description: 'Attempts made, retries included' })
  attempts: number;

  @ApiProperty({ type: String, nullable: true })
  lastError: string | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'SMTP reply code of the last error',
  })
  lastErrorCode: number | null;

  @ApiProperty({
    enum: EmailSkipReason,
    enumName: 'EmailSkipReason',
    nullable: true,
  })
  skipReason: EmailSkipReason | null;

  @ApiProperty({
    enum: EmailCancelReason,
    enumName: 'EmailCancelReason',
    nullable: true,
  })
  cancelReason: EmailCancelReason | null;

  @ApiProperty({ type: String, format: 'date-time' })
  queuedAt: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastAttemptAt: Date | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Earliest moment of the next automatic attempt',
  })
  nextAttemptAt: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  sentAt: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  failedAt: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  cancelledAt: Date | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'After this moment the email is pointless and is not sent',
  })
  validUntil: Date | null;

  @ApiProperty({
    enum: EmailRetryBlock,
    enumName: 'EmailRetryBlock',
    nullable: true,
    description: 'Why the email cannot be sent again; null when it can',
  })
  retryBlock: EmailRetryBlock | null;

  @ApiProperty({ description: 'Waiting or failed: can be cancelled' })
  canCancel: boolean;

  static fill<T extends EmailMessageDto>(
    target: T,
    message: EmailMessage,
    lookups: EmailMessageLookups,
  ): T {
    return Object.assign(target, {
      id: message.id,
      status: message.status,
      template: message.template as EmailTemplate,
      audience: message.audience,
      deliveryMode: message.deliveryMode,
      recipient: message.recipient,
      subject: message.subject,
      brandId: message.brandId,
      brandName: message.brandId
        ? (lookups.brandNames.get(message.brandId) ?? null)
        : null,
      locationId: message.locationId,
      locationName: message.locationId
        ? (lookups.locationNames.get(message.locationId) ?? null)
        : null,
      bookingId: message.bookingId,
      attempts: message.attempts,
      lastError: message.lastError,
      lastErrorCode: message.lastErrorCode,
      skipReason: message.skipReason,
      cancelReason: message.cancelReason,
      queuedAt: message.queuedAt,
      lastAttemptAt: message.lastAttemptAt,
      nextAttemptAt: message.nextAttemptAt,
      sentAt: message.sentAt,
      failedAt: message.failedAt,
      cancelledAt: message.cancelledAt,
      validUntil: message.validUntil,
      retryBlock: emailRetryBlock(
        message,
        lookups.clientNotificationsEnabled,
        lookups.now,
      ),
      canCancel: isEmailCancellable(message),
    });
  }

  static from(
    message: EmailMessage,
    lookups: EmailMessageLookups,
  ): EmailMessageDto {
    return EmailMessageDto.fill(new EmailMessageDto(), message, lookups);
  }
}
