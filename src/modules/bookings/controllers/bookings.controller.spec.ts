import { ForbiddenException } from '@nestjs/common';
import { Claim } from '../../access/enums/claim.enum.js';
import { Write, removeGrant } from '../../access/utils/permission.js';
import { tokenPayload } from '../../auth/testing/factories/token-payload.factory.js';
import { ManualCreateBookingDto } from '../dto/manual-create-booking.dto.js';
import { BookingsController } from './bookings.controller.js';

describe('Manual booking API permissions', () => {
  const create = {
    createManualBooking: vi.fn().mockResolvedValue({ id: 'booking' }),
  };
  const controller = new BookingsController(
    {} as never,
    create as never,
    {} as never,
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
    const token = tokenPayload('MANAGER');
    removeGrant(token.permissions!['L:location-1'], Write(Claim.ORDER));
    const dto = {
      products: [{ productId: 'product', quantity: '1' }],
    } as ManualCreateBookingDto;
    await expect(
      controller.createManual('location-1', dto, token),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(create.createManualBooking).not.toHaveBeenCalled();
  });

  it('allows booking without client management and passes only the financial creation choice', async () => {
    const token = tokenPayload('MANAGER');
    removeGrant(token.permissions!['L:location-1'], Write(Claim.ORDER));
    removeGrant(token.permissions!['G:brand-1'], Write(Claim.CLIENT));
    const dto = {} as ManualCreateBookingDto;
    await controller.createManual('location-1', dto, token);
    expect(create.createManualBooking).toHaveBeenCalledWith(
      'location-1',
      dto,
      expect.objectContaining({ id: token.sub }),
      false,
    );
  });
});
