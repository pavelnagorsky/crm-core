import { BadRequestException, HttpStatus, Injectable } from '@nestjs/common';
import { Client } from '@prisma/client';
import { AppException } from '../../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../../shared/validation/error-codes.enum.js';
import { ClientsService } from '../../../clients/services/clients.service.js';
import { LocationService } from '../../../location/services/location.service.js';
import { UpdateBookingDto } from '../../dto/update-booking.dto.js';
import { BookingWithItems } from '../../interfaces/booking-with-items.interface.js';

/** The client a booking update links, with the contact snapshot the booking stores. */
export interface BookingClientLink {
  clientId: string | null;
  clientFirstName: string;
  clientLastName: string;
  clientPhone: string | null;
  clientEmail: string | null;
}

/**
 * Resolves a client change of a staff booking update, the way a manual booking picks its
 * client: by clientId, anonymous, or found or created by phone (linkClientByPhone).
 */
@Injectable()
export class BookingClientLinkService {
  constructor(
    private readonly clients: ClientsService,
    private readonly locations: LocationService,
  ) {}

  /** Null when the request does not change the client; contact fields then edit the snapshot only. */
  async resolve(
    booking: BookingWithItems,
    dto: UpdateBookingDto,
  ): Promise<BookingClientLink | null> {
    const anonymous = dto.anonymous === true;
    const byPhone = dto.linkClientByPhone === true;
    const modes = [Boolean(dto.clientId), anonymous, byPhone].filter(Boolean);
    if (modes.length === 0) return null;
    if (modes.length > 1)
      throw new AppException(
        ErrorCode.BOOKING_CLIENT_CONFLICT,
        HttpStatus.BAD_REQUEST,
      );
    if (anonymous)
      return {
        clientId: null,
        clientFirstName: dto.firstName?.trim() ?? '',
        clientLastName: dto.lastName?.trim() ?? '',
        clientPhone: dto.phone?.trim() || null,
        clientEmail: dto.email ?? null,
      };

    const { brandId } = await this.locations.getBookingSettings(
      booking.locationId,
    );
    if (dto.clientId) {
      const picked = await this.clients.findForBooking(brandId, dto.clientId);
      if (!picked)
        throw new AppException(
          ErrorCode.BOOKING_CLIENT_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
      return this.fromClient(picked);
    }
    const firstName = dto.firstName?.trim();
    const phone = dto.phone?.trim();
    if (!firstName || !phone)
      throw new BadRequestException('Client first name and phone are required');
    const found = await this.clients.resolveForBooking(
      brandId,
      phone,
      firstName,
      dto.lastName?.trim() || '',
      dto.email,
    );
    return this.fromClient(found);
  }

  private fromClient(client: Client): BookingClientLink {
    return {
      clientId: client.id,
      clientFirstName: client.firstName,
      clientLastName: client.lastName,
      clientPhone: client.phone,
      clientEmail: client.email,
    };
  }
}
