import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AvailableSlotsRequestDto } from './available-slots-request.dto.js';

describe('AvailableSlotsRequestDto', () => {
  it('accepts a single serviceIds query value as a one-item array', async () => {
    const dto = plainToInstance(AvailableSlotsRequestDto, {
      serviceIds: '325a2f6c-75d7-46ad-bb10-115c9695fae6',
    });

    expect(dto.serviceIds).toEqual(['325a2f6c-75d7-46ad-bb10-115c9695fae6']);
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('accepts repeated serviceIds query values as an array', async () => {
    const dto = plainToInstance(AvailableSlotsRequestDto, {
      serviceIds: ['325a2f6c-75d7-46ad-bb10-115c9695fae6', '425a2f6c-75d7-46ad-bb10-115c9695fae6'],
    });

    expect(dto.serviceIds).toEqual([
      '325a2f6c-75d7-46ad-bb10-115c9695fae6',
      '425a2f6c-75d7-46ad-bb10-115c9695fae6',
    ]);
    await expect(validate(dto)).resolves.toHaveLength(0);
  });
});
