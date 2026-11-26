import { ApiProperty } from '@nestjs/swagger';
import { Client } from '@prisma/client';
import { ApiPercent } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { ClientDiscountStats } from '../../bookings/interfaces/client-discount-stats.interface.js';
import { ClientDiscountStatsDto } from './client-discount-stats.dto.js';
import { TrafficSource } from '../../../shared/traffic/enums/traffic-source.enum.js';

export class ClientResponseDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  brandId: string;

  @ApiProperty({ type: String, nullable: true })
  userId: string | null;

  @ApiProperty({ type: String })
  firstName: string;

  @ApiProperty({ type: String })
  lastName: string;

  @ApiProperty({ type: String })
  phone: string;

  @ApiProperty({ type: String, nullable: true })
  email: string | null;

  @ApiProperty({ type: Date, nullable: true })
  birthDate: Date | null;

  @ApiProperty({ type: String, nullable: true })
  gender: string | null;

  @ApiProperty({ type: String, nullable: true })
  notes: string | null;

  @ApiProperty({ type: Date, nullable: true })
  bannedAt: Date | null;

  @ApiProperty({ type: String, nullable: true })
  banReason: string | null;

  @ApiProperty({
    enum: TrafficSource,
    enumName: 'TrafficSource',
    nullable: true,
    description:
      'Where the client came from: the source of their first booking in the brand, or set by staff. Null: not known',
  })
  acquisitionSource: TrafficSource | null;

  @ApiProperty({ type: String, maxLength: 64, nullable: true })
  acquisitionSourceDetail: string | null;

  @ApiProperty({
    type: Date,
    nullable: true,
    description:
      'When the first booking in the brand was made. Null for imported clients and clients without bookings',
  })
  acquiredAt: Date | null;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'The first booking in the brand',
  })
  acquisitionBookingId: string | null;

  @ApiPercent({
    nullable: true,
    example: '10.00',
    description: 'Personal discount on services, percent; null = none.',
  })
  servicesDiscountPercent: string | null;

  @ApiPercent({
    nullable: true,
    example: '10.00',
    description: 'Personal discount on products, percent; null = none.',
  })
  productsDiscountPercent: string | null;

  @ApiProperty({ type: () => ClientDiscountStatsDto })
  discountStats: ClientDiscountStatsDto;

  @ApiProperty({ type: Date })
  createdAt: Date;

  @ApiProperty({ type: Date })
  updatedAt: Date;

  static fromEntity(
    client: Client,
    discountStats?: ClientDiscountStats,
  ): ClientResponseDto {
    const dto = new ClientResponseDto();
    dto.id = client.id;
    dto.brandId = client.brandId;
    dto.userId = client.userId;
    dto.firstName = client.firstName;
    dto.lastName = client.lastName;
    dto.phone = client.phone;
    dto.email = client.email;
    dto.birthDate = client.birthDate;
    dto.gender = client.gender;
    dto.notes = client.notes;
    dto.bannedAt = client.bannedAt;
    dto.banReason = client.banReason;
    dto.acquisitionSource = client.acquisitionSource as TrafficSource | null;
    dto.acquisitionSourceDetail = client.acquisitionSourceDetail;
    dto.acquiredAt = client.acquiredAt;
    dto.acquisitionBookingId = client.acquisitionBookingId;
    dto.servicesDiscountPercent =
      client.servicesDiscountPercent === null
        ? null
        : MoneyUtils.format(client.servicesDiscountPercent);
    dto.productsDiscountPercent =
      client.productsDiscountPercent === null
        ? null
        : MoneyUtils.format(client.productsDiscountPercent);
    dto.discountStats = ClientDiscountStatsDto.fromStats(discountStats);
    dto.createdAt = client.createdAt;
    dto.updatedAt = client.updatedAt;
    return dto;
  }
}
