import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { CancelledBy } from '@prisma/client';
import { ApiResponseArray } from '../../../shared/dto/api-response-array.dto.js';
import { ApiResponse } from '../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../shared/dto/base-response.dto.js';
import { IdResponseDto } from '../../../shared/dto/id-response.dto.js';
import { XlsxUtils } from '../../../shared/xlsx/xlsx.utils.js';
import { Claim } from '../../access/enums/claim.enum.js';
import {
  assertPermission,
  hasPermission,
} from '../../access/utils/assert-permission.js';
import { Read, Write } from '../../access/utils/permission.js';
import { auditActorFromToken } from '../../audit/utils/audit-actor-from-token.js';
import { Permissions } from '../../auth/decorators/permissions.decorator.js';
import { TokenPayload } from '../../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../../auth/dto/token-payload.dto.js';
import { AddOrderItemsDto } from '../../orders/dto/add-order-items.dto.js';
import { OrderProductItemDto } from '../../orders/dto/order-product-item.dto.js';
import { BookingCreateFacade } from '../booking-create.facade.js';
import { BookingsFacade } from '../bookings.facade.js';
import { BookingPricingRequestDto } from '../dto/booking-pricing-request.dto.js';
import { BookingPricingResponseDto } from '../dto/booking-pricing-response.dto.js';
import { BookingResolveRequestDto } from '../dto/booking-resolve-request.dto.js';
import { BookingResolveResponseDto } from '../dto/booking-resolve-response.dto.js';
import { BookingDetailsResponseDto } from '../dto/booking-details-response.dto.js';
import { BookingResponseDto } from '../dto/booking-response.dto.js';
import { BookingSearchRequestDto } from '../dto/booking-search-request.dto.js';
import { BookingSearchResponseDto } from '../dto/booking-search-response.dto.js';
import { BookingSetupResponseDto } from '../dto/booking-setup-response.dto.js';
import { BookingStatusCountResponseDto } from '../dto/booking-status-count-response.dto.js';
import { BookingWriteResponseDto } from '../dto/booking-write-response.dto.js';
import { CancelBookingDto } from '../dto/cancel-booking.dto.js';
import { ClientBookingSummaryResponseDto } from '../dto/client-booking-summary-response.dto.js';
import { ClientLinkResponseDto } from '../dto/client-link-response.dto.js';
import { StaffPopularServicesDto } from '../dto/staff-popular-services.dto.js';
import { ManualCreateBookingDto } from '../dto/manual-create-booking.dto.js';
import { PayBookingDto } from '../dto/pay-booking.dto.js';
import { PayBookingResponseDto } from '../dto/pay-booking-response.dto.js';
import { UpdateBookingStatusDto } from '../dto/update-booking-status.dto.js';
import { UpdateBookingDto } from '../dto/update-booking.dto.js';
import { BookingStatus } from '../enums/booking-status.enum.js';
import { BookingExportRequestDto } from '../export/dto/booking-export-request.dto.js';
import { BookingsExportService } from '../export/services/bookings-export.service.js';
import { LocationService } from '../../location/services/location.service.js';
import { ReviewsFacade } from '../../reviews/reviews.facade.js';
import { BookingAccessService } from '../services/booking-access.service.js';
import { BookingClientTokenService } from '../services/booking-client-token.service.js';

@ApiTags('Bookings')
@Controller()
export class BookingsController {
  constructor(
    private readonly bookings: BookingsFacade,
    private readonly bookingCreateService: BookingCreateFacade,
    private readonly bookingClientService: BookingClientTokenService,
    private readonly bookingsExportService: BookingsExportService,
    private readonly access: BookingAccessService,
    private readonly locations: LocationService,
    private readonly reviews: ReviewsFacade,
  ) {}

  // ─── Public ──────────────────────────────────────────────────────────────────

  @ApiOperation({
    summary: 'Get services, staff and products for booking screen (public)',
  })
  @ApiOkResponse({ type: ApiResponse(BookingSetupResponseDto) })
  @Get('public/locations/:locationId/booking-setup')
  @Header('Cache-Control', 'no-store')
  async getBookingSetup(
    @Param('locationId', ParseUUIDPipe) locationId: string,
  ): Promise<BaseResponseDto<BookingSetupResponseDto>> {
    const [setup, settings] = await Promise.all([
      this.bookings.getBookingSetup(locationId),
      this.locations.getBookingSettings(locationId),
    ]);
    const staffSummaries = settings.reviewsEnabled
      ? await this.reviews.getStaffSummaries(
          locationId,
          setup.staff.map((staff) => staff.id),
        )
      : undefined;
    return BaseResponseDto.success(
      BookingSetupResponseDto.fromEntity(setup, staffSummaries),
    );
  }

  @ApiOperation({
    summary:
      'Resolve available services/staff for a partial booking selection (public)',
  })
  @ApiOkResponse({ type: ApiResponse(BookingResolveResponseDto) })
  @Post('public/locations/:locationId/booking-resolve')
  async resolveBooking(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: BookingResolveRequestDto,
  ): Promise<BaseResponseDto<BookingResolveResponseDto>> {
    return BaseResponseDto.success(
      BookingResolveResponseDto.fromResult(
        await this.bookings.resolveBookingSelection(locationId, dto),
      ),
    );
  }

  @ApiOperation({
    summary: 'Calculate booking pricing preview (public)',
  })
  @ApiOkResponse({ type: ApiResponse(BookingPricingResponseDto) })
  @ApiNotFoundResponse({
    description: 'Location, service, or product not found',
  })
  @Post('public/locations/:locationId/pricing')
  async priceBooking(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: BookingPricingRequestDto,
  ): Promise<BaseResponseDto<BookingPricingResponseDto>> {
    const pricing = await this.bookingCreateService.price(locationId, dto);
    return BaseResponseDto.success(
      BookingPricingResponseDto.fromResult(pricing),
    );
  }

  // ─── Owner / Staff ────────────────────────────────────────────────────────────

  @ApiOperation({
    summary:
      'Create a booking manually. booking:write creates any booking; booking.own:write only one in which the caller performs a service',
  })
  @ApiCreatedResponse({ type: ApiResponse(BookingWriteResponseDto) })
  @ApiBadRequestResponse({
    description:
      'BOOKING_STATUS_BEFORE_START: COMPLETED or NO_SHOW for a visit that has not started; BOOKING_CLIENT_CONFLICT: clientId with anonymous; BOOKING_STAFF_ASSIGNMENT_OVERLAP: custom time puts one staff member on overlapping services; TRAFFIC_SOURCE_DETAIL_WITHOUT_SOURCE: trafficSourceDetail without trafficSource; validation: trafficSource DIRECT',
  })
  @ApiNotFoundResponse({
    description:
      'BOOKING_BUSINESS_NOT_FOUND / BOOKING_SERVICE_NOT_FOUND / BOOKING_BUNDLE_NOT_FOUND; BOOKING_STAFF_NOT_FOUND: a requested staff member is inactive, not in the location or does not perform the service (also with isCustomTime); BOOKING_CLIENT_NOT_FOUND: clientId is unknown or belongs to another brand',
  })
  @ApiConflictResponse({
    description:
      'BOOKING_NO_STAFF_AVAILABLE: no qualified staff member is free for a service (with isCustomTime: nobody performs it, or a parallel bundle has fewer distinct qualified staff than services). BOOKING_SLOT_UNAVAILABLE: the slot was taken while saving (never with isCustomTime)',
  })
  @ApiForbiddenResponse({
    description:
      'BOOKING_OWN_STAFF_REQUIRED: with booking.own:write only, the caller performs none of the services. Custom prices also need sale.price.override:write, products and confirmProducts order:write. A payment needs no extra permission',
    type: ForbiddenException,
  })
  @Permissions([Write(Claim.BOOKING), Write(Claim.BOOKING_OWN)])
  @Post('locations/:locationId/bookings/manual')
  async createManual(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: ManualCreateBookingDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<BookingWriteResponseDto>> {
    if (
      dto.items?.some((item) => item.customPrice != null) ||
      dto.products?.some((item) => item.customUnitPrice != null)
    )
      assertPermission(
        tokenPayload,
        Write(Claim.SALE_PRICE_OVERRIDE),
        locationId,
      );
    if (dto.products?.length)
      assertPermission(tokenPayload, Write(Claim.ORDER), locationId);
    const booking = await this.bookingCreateService.createManualBooking(
      locationId,
      dto,
      auditActorFromToken(tokenPayload, locationId),
      await this.access.createStaffId(tokenPayload, locationId),
    );
    return BaseResponseDto.success(
      BookingWriteResponseDto.fromBooking(booking),
    );
  }

  @ApiOperation({ summary: 'Get booking count per status' })
  @ApiOkResponse({ type: ApiResponseArray(BookingStatusCountResponseDto) })
  @Permissions([Read(Claim.BOOKING), Read(Claim.BOOKING_OWN)])
  @Get('locations/:locationId/bookings/status-counts')
  async getStatusCounts(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<BaseResponseDto<BookingStatusCountResponseDto[]>> {
    const counts = await this.bookings.getStatusCounts(
      locationId,
      await this.access.readStaffId(token, locationId),
    );
    return BaseResponseDto.success(
      counts.map((r) => Object.assign(new BookingStatusCountResponseDto(), r)),
    );
  }

  @ApiOperation({
    summary:
      'Services and bundles each staff member of the location completed most in the last 90 days, for quick picks in the booking dialog',
    description:
      'One entry per staff member with completed visits in the period; staff without history are absent. Items are not filtered by the current catalog or staff skills.',
  })
  @ApiOkResponse({ type: ApiResponseArray(StaffPopularServicesDto) })
  @ApiNotFoundResponse({ description: 'Location not found' })
  @Permissions([Read(Claim.BOOKING), Read(Claim.BOOKING_OWN)])
  @Get('locations/:locationId/bookings/popular-services')
  async getPopularServices(
    @Param('locationId', ParseUUIDPipe) locationId: string,
  ): Promise<BaseResponseDto<StaffPopularServicesDto[]>> {
    const popular = await this.bookings.getPopularServices(locationId);
    return BaseResponseDto.success(
      popular.map(StaffPopularServicesDto.fromEntity),
    );
  }

  @ApiOperation({
    summary:
      'Booking history of a brand client for the booking dialog: visit counts, last visit, upcoming booking and services taken before',
    description:
      'Counts completed visits only, across all active locations of the brand and all staff. Services of bundle visits count for the bundle. Same access as the client card: location:read here, plus client:read on the brand or booking:write / booking.own:write in a location of the brand.',
  })
  @ApiOkResponse({ type: ApiResponse(ClientBookingSummaryResponseDto) })
  @ApiNotFoundResponse({
    description: 'Location not found, or the client is not in its brand',
  })
  @Permissions(Read(Claim.LOCATION))
  @Get('locations/:locationId/clients/:clientId/booking-summary')
  async getClientBookingSummary(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<BaseResponseDto<ClientBookingSummaryResponseDto>> {
    const { brandId } = await this.locations.getBookingSettings(locationId);
    this.access.assertClientRead(token, brandId);
    const summary = await this.bookings.getClientBookingSummary(
      locationId,
      clientId,
    );
    return BaseResponseDto.success(
      ClientBookingSummaryResponseDto.fromSummary(summary),
    );
  }

  @ApiOperation({ summary: 'Export bookings as XLSX' })
  @ApiProduces(XlsxUtils.mimeType)
  @ApiOkResponse({ description: 'File stream' })
  @Permissions(Read(Claim.BOOKING_EXPORT))
  @Get('locations/:locationId/bookings/export')
  async export(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Query() dto: BookingExportRequestDto,
    @Res({ passthrough: true })
    res: { setHeader: (name: string, value: string) => void },
  ): Promise<StreamableFile> {
    const { stream, filename } = await this.bookingsExportService.stream(
      locationId,
      dto,
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return new StreamableFile(stream, { type: XlsxUtils.mimeType });
  }

  @ApiOperation({
    summary: 'Get booking by ID, with the client review for review:read',
  })
  @ApiOkResponse({ type: ApiResponse(BookingDetailsResponseDto) })
  @ApiNotFoundResponse({ description: 'Booking not found' })
  @Permissions([Read(Claim.BOOKING), Read(Claim.BOOKING_OWN)])
  @Get('locations/:locationId/bookings/:id')
  async findById(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<BaseResponseDto<BookingDetailsResponseDto>> {
    const booking = await this.bookings.findByIdInLocation(locationId, id);
    await this.access.assertRead(token, booking);
    const [review, traffic, payment] = await Promise.all([
      this.access.canReadReview(token, locationId)
        ? this.reviews.findForBooking(booking.id)
        : null,
      this.bookings.findTrafficDetails(booking.id),
      this.bookings.getPaymentSummary(booking),
    ]);
    return BaseResponseDto.success(
      BookingDetailsResponseDto.fromBooking(booking, review, traffic, payment),
    );
  }

  @ApiOperation({ summary: 'Search bookings' })
  @ApiOkResponse({ type: ApiResponse(BookingSearchResponseDto) })
  @Permissions([Read(Claim.BOOKING), Read(Claim.BOOKING_OWN)])
  @Get('locations/:locationId/bookings')
  async search(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Query() dto: BookingSearchRequestDto,
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<BaseResponseDto<BookingSearchResponseDto>> {
    const { items, totalItems } = await this.bookings.search(
      locationId,
      dto,
      await this.access.readStaffId(token, locationId),
    );
    return BaseResponseDto.success(
      new BookingSearchResponseDto(
        items.map(BookingResponseDto.fromEntity),
        dto.page,
        dto.pageSize,
        totalItems,
        dto.isExport,
      ),
    );
  }

  @ApiOperation({
    summary: 'Update an accessible booking',
    description:
      'With payment and confirmProductItemIds the visit is paid after the edit in the same transaction, by the rules and errors of PUT bookings/:id/payment.',
  })
  @ApiOkResponse({ type: ApiResponse(BookingWriteResponseDto) })
  @ApiBadRequestResponse({
    description:
      'BOOKING_TRAFFIC_SOURCE_READ_ONLY: trafficSource or trafficSourceDetail on an online booking; TRAFFIC_SOURCE_DETAIL_WITHOUT_SOURCE: a detail without a source',
  })
  @ApiNotFoundResponse({ description: 'Booking not found' })
  @ApiConflictResponse({ description: 'Slot is no longer available' })
  @ApiForbiddenResponse({
    description:
      'confirmProductItemIds and replacing an active payment need order:write',
  })
  @Permissions([Write(Claim.BOOKING), Write(Claim.BOOKING_OWN)])
  @Put('locations/:locationId/bookings/:id')
  async update(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBookingDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<BookingWriteResponseDto>> {
    const current = await this.bookings.findByIdInLocation(locationId, id);
    await this.access.assertEdit(tokenPayload, current);
    if (
      dto.items?.some((patch) => {
        const previous = current.items.find(
          (item) => item.id === patch.id,
        )?.customPrice;
        return patch.customPrice == null
          ? previous != null
          : previous == null || !previous.equals(patch.customPrice);
      })
    )
      assertPermission(
        tokenPayload,
        Write(Claim.SALE_PRICE_OVERRIDE),
        locationId,
      );
    if (dto.confirmProductItemIds?.length)
      assertPermission(tokenPayload, Write(Claim.ORDER), locationId);
    const booking = await this.bookings.update(
      current,
      auditActorFromToken(tokenPayload, locationId),
      dto,
      hasPermission(tokenPayload, Write(Claim.ORDER), locationId),
    );
    return BaseResponseDto.success(
      BookingWriteResponseDto.fromBooking(booking),
    );
  }

  @ApiOperation({ summary: 'Update booking status' })
  @ApiOkResponse({ type: ApiResponse(IdResponseDto) })
  @ApiNotFoundResponse({ description: 'Booking not found' })
  @Permissions([Write(Claim.BOOKING), Write(Claim.BOOKING_OWN)])
  @Patch('locations/:locationId/bookings/:id/status')
  async updateStatus(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBookingStatusDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    const current = await this.bookings.findByIdInLocation(locationId, id);
    await this.access.assertManage(tokenPayload, current);
    if (
      current.status === BookingStatus.COMPLETED &&
      dto.status !== BookingStatus.COMPLETED
    )
      assertPermission(tokenPayload, Write(Claim.ORDER_RETURN), locationId);
    const booking = await this.bookings.updateStatus(
      current,
      auditActorFromToken(tokenPayload, locationId),
      dto,
    );
    return BaseResponseDto.success({ id: booking.id });
  }

  @ApiOperation({
    summary: 'Pay a visit',
    description:
      'Records how the client paid the whole amount due of the visit (services by the booking plus sold products), or replaces the active payment. A started PENDING or CONFIRMED visit is completed in the same transaction (order services, earnings); a visit that has not started keeps its status (prepayment). confirmProductItemIds sells draft products first, so the payment covers them. NO_SHOW and CANCELLED: only already sold products are due. Any error rolls everything back. A retry with the same key returns the first result without effects, also for a master.',
  })
  @ApiOkResponse({ type: ApiResponse(PayBookingResponseDto) })
  @ApiBadRequestResponse({
    description: 'PAYMENT_SPLIT_INVALID, PAYMENT_DATE_INVALID',
  })
  @ApiNotFoundResponse({
    description: 'Booking not found; ORDER_ITEM_NOT_FOUND',
  })
  @ApiForbiddenResponse({
    description:
      'booking.own:write for a visit of another master. Replacing an active payment and confirmProductItemIds need order:write',
  })
  @ApiConflictResponse({
    description:
      'PAYMENT_AMOUNT_MISMATCH: responseValue { amountDue, requiredAmount }. PAYMENT_NOTHING_DUE. PAYMENT_IDEMPOTENCY_CONFLICT: responseValue { operationId }. BOOKING_PAYMENT_NOT_ALLOWED: confirmProductItemIds for NO_SHOW or CANCELLED. ORDER_ITEM_NOT_DRAFT, ORDER_PRODUCT_NOT_SELLABLE, ORDER_SELLER_INVALID. Completion errors as in PATCH status',
  })
  @Permissions([Write(Claim.BOOKING), Write(Claim.BOOKING_OWN)])
  @Put('locations/:locationId/bookings/:id/payment')
  async pay(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PayBookingDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<PayBookingResponseDto>> {
    const current = await this.bookings.findByIdInLocation(locationId, id);
    // Paying is like completing: a master pays their own visit.
    await this.access.assertManage(tokenPayload, current);
    const participantStaffId = await this.access.manageStaffId(
      tokenPayload,
      locationId,
    );
    if (dto.confirmProductItemIds?.length)
      assertPermission(tokenPayload, Write(Claim.ORDER), locationId);
    const { orderId, operationId } = await this.bookings.pay(
      current,
      dto,
      auditActorFromToken(tokenPayload, locationId),
      hasPermission(tokenPayload, Write(Claim.ORDER), locationId),
      participantStaffId,
    );
    return BaseResponseDto.success({ id: current.id, orderId, operationId });
  }

  @ApiOperation({ summary: 'Add a draft product sale to a booking order' })
  @ApiOkResponse({ type: ApiResponse(IdResponseDto) })
  @ApiNotFoundResponse({ description: 'Booking or product not found' })
  @ApiConflictResponse({ description: 'Product cannot be added' })
  @Permissions(Read(Claim.BOOKING), Write(Claim.ORDER))
  @Post('locations/:locationId/bookings/:id/products')
  async addProduct(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OrderProductItemDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    const order = await this.bookings.addProduct(
      locationId,
      id,
      auditActorFromToken(tokenPayload, locationId),
      dto,
      hasPermission(tokenPayload, Write(Claim.SALE_PRICE_OVERRIDE), locationId),
    );
    return BaseResponseDto.success({ id: order.id });
  }

  @ApiOperation({ summary: 'Add draft product items to a booking order' })
  @ApiOkResponse({ type: ApiResponse(IdResponseDto) })
  @ApiNotFoundResponse({ description: 'Booking or product not found' })
  @ApiConflictResponse({ description: 'Product cannot be added' })
  @Permissions(Read(Claim.BOOKING), Write(Claim.ORDER))
  @Post('locations/:locationId/bookings/:id/items')
  async addItems(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddOrderItemsDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    const order = await this.bookings.addProducts(
      locationId,
      id,
      auditActorFromToken(tokenPayload, locationId),
      dto,
      hasPermission(tokenPayload, Write(Claim.SALE_PRICE_OVERRIDE), locationId),
    );
    return BaseResponseDto.success({ id: order.id });
  }

  @ApiOperation({ summary: 'Generate client management token for a booking' })
  @ApiOkResponse({ type: ApiResponse(ClientLinkResponseDto) })
  @ApiNotFoundResponse({ description: 'Booking not found' })
  @Permissions(Write(Claim.BOOKING_CLIENT_TOKEN))
  @Post('locations/:locationId/bookings/:id/client-token')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async generateClientToken(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BaseResponseDto<ClientLinkResponseDto>> {
    await this.bookings.findByIdInLocation(locationId, id);
    const token = this.bookingClientService.generateClientToken(id);
    return BaseResponseDto.success({
      token,
      manageUrl: this.bookingClientService.managementUrl(token),
    });
  }

  @ApiOperation({ summary: 'Cancel a booking' })
  @ApiOkResponse({ type: ApiResponse(IdResponseDto) })
  @ApiNotFoundResponse({ description: 'Booking not found' })
  @ApiConflictResponse({ description: 'Booking is already cancelled' })
  @Permissions([Write(Claim.BOOKING), Write(Claim.BOOKING_OWN)])
  @Post('locations/:locationId/bookings/:id/cancel')
  async cancel(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelBookingDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    const current = await this.bookings.findByIdInLocation(locationId, id);
    await this.access.assertManage(tokenPayload, current);
    if (current.status === BookingStatus.COMPLETED)
      assertPermission(tokenPayload, Write(Claim.ORDER_RETURN), locationId);
    const booking = await this.bookings.cancel(
      current,
      auditActorFromToken(tokenPayload, locationId),
      CancelledBy.STAFF,
      dto,
    );
    return BaseResponseDto.success({ id: booking.id });
  }

  @ApiOperation({ summary: 'Delete a booking' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'Booking not found' })
  @ApiConflictResponse({
    description:
      'BOOKING_HAS_PAYMENTS: the visit has a paid amount; void the payment or refund the money first',
  })
  @Permissions(Write(Claim.BOOKING_DELETE))
  @Delete('locations/:locationId/bookings/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<void> {
    const current = await this.bookings.findByIdInLocation(locationId, id);
    if (current.status === BookingStatus.COMPLETED)
      assertPermission(tokenPayload, Write(Claim.ORDER_RETURN), locationId);
    await this.bookings.delete(
      current,
      auditActorFromToken(tokenPayload, locationId),
    );
  }
}
