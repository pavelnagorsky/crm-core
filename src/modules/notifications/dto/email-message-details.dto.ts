import { ApiProperty } from '@nestjs/swagger';
import { EmailMessage, EmailMessageEvent } from '@prisma/client';
import { EmailMessageLookups } from '../interfaces/email-message-lookups.interface.js';
import { EmailMessageEventDto } from './email-message-event.dto.js';
import { EmailMessageDto } from './email-message.dto.js';

export class EmailMessageDetailsDto extends EmailMessageDto {
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Message-ID the SMTP server accepted',
  })
  providerMessageId: string | null;

  @ApiProperty({
    description: 'The content is stored: preview and retry use it',
  })
  hasContent: boolean;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  retriedAt: Date | null;

  @ApiProperty({ type: String, nullable: true })
  retriedByName: string | null;

  @ApiProperty({ type: String, nullable: true })
  cancelledByName: string | null;

  @ApiProperty({
    type: () => EmailMessageEventDto,
    isArray: true,
    description: 'Oldest first',
  })
  events: EmailMessageEventDto[];

  static fromDetails(
    message: EmailMessage,
    events: EmailMessageEvent[],
    lookups: EmailMessageLookups,
  ): EmailMessageDetailsDto {
    const name = (id: string | null) =>
      id ? (lookups.actorNames.get(id) ?? null) : null;
    return Object.assign(
      EmailMessageDto.fill(new EmailMessageDetailsDto(), message, lookups),
      {
        providerMessageId: message.providerMessageId,
        hasContent: message.payload !== null,
        retriedAt: message.retriedAt,
        retriedByName: name(message.retriedById),
        cancelledByName: name(message.cancelledById),
        events: events.map((event) =>
          EmailMessageEventDto.from(event, lookups.actorNames),
        ),
      },
    );
  }
}
