import { ForbiddenException } from '@nestjs/common';
import { tokenPayload } from '../../../test/factories/token-payload.factory.js';
import { Permission } from '../access/enums/permission.enum.js';
import { BookingsController } from './bookings.controller.js';
import { ManualCreateBookingDto } from './dto/manual-create-booking.dto.js';

describe('Manual booking API permissions', () => {
  const create = {
    createManualBooking: vi.fn().mockResolvedValue({ id: 'booking' }),
  };
  const controller = new BookingsController(
    {} as never,
    create as never,
    {} as never,
    {} as never,
  );
  beforeEach(() => vi.clearAllMocks());

  it('rejects a custom price before creating the booking', async () => {
    const dto = {
      products: [{ customUnitPrice: '5' }],
    } as ManualCreateBookingDto;
    await expect(
      controller.createManual('location-1', dto, tokenPayload('STAFF')),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(create.createManualBooking).not.toHaveBeenCalled();
  });

  it('rejects adding products when order editing was disabled', async () => {
    const token = tokenPayload('STAFF');
    token.permissions!['L:location-1'] = token.permissions![
      'L:location-1'
    ].filter((p) => p !== Permission.ORDER_UPDATE);
    const dto = {
      products: [{ productId: 'product', quantity: '1' }],
    } as ManualCreateBookingDto;
    await expect(
      controller.createManual('location-1', dto, token),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(create.createManualBooking).not.toHaveBeenCalled();
  });

  it('passes explicit creation choices without passing the JWT to the service', async () => {
    const token = tokenPayload('STAFF');
    token.permissions!['L:location-1'] = token.permissions![
      'L:location-1'
    ].filter((p) => p !== Permission.ORDER_CONFIRM);
    token.permissions!['G:brand-1'] = token.permissions!['G:brand-1'].filter(
      (p) => p !== Permission.CLIENT_CREATE,
    );
    const dto = {} as ManualCreateBookingDto;
    await controller.createManual('location-1', dto, token);
    expect(create.createManualBooking).toHaveBeenCalledWith(
      'location-1',
      dto,
      expect.objectContaining({ id: token.sub }),
      false,
      false,
    );
  });
});
