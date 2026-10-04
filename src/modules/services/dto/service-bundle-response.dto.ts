import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { FileResponseDto } from '../../../shared/dto/file-response.dto.js';
import { MoneyService } from '../../../shared/money/money.service.js';
import { BookingExecutionMode } from '../../bookings/enums/booking-execution-mode.enum.js';
import { ServiceStatus } from '../enums/service-status.enum.js';
import { BundlePricingMode } from '../enums/bundle-pricing-mode.enum.js';
import { ServiceBundleView } from '../interfaces/service-bundle-view.interface.js';
import { ServiceBundleItemResponseDto } from './service-bundle-item-response.dto.js';

export class ServiceBundleResponseDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  businessId: string;

  @ApiProperty({ type: String, nullable: true })
  categoryId: string | null;

  @ApiProperty({ type: () => FileResponseDto, nullable: true })
  image: FileResponseDto | null;

  @ApiProperty({ type: String })
  title: string;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty({ enum: BookingExecutionMode, enumName: 'BookingExecutionMode' })
  executionMode: BookingExecutionMode;

  @ApiProperty({ enum: BundlePricingMode, enumName: 'BundlePricingMode' })
  pricingMode: BundlePricingMode;

  @ApiPrice({ nullable: true })
  fixedPrice: string | null;

  @ApiPrice()
  price: string;

  @ApiProperty({ type: Number })
  durationMinutes: number;

  @ApiProperty({ enum: ServiceStatus, enumName: 'ServiceStatus' })
  status: ServiceStatus;

  @ApiProperty({ type: Number })
  sortOrder: number;

  @ApiProperty({ type: () => ServiceBundleItemResponseDto, isArray: true })
  items: ServiceBundleItemResponseDto[];

  @ApiProperty({ type: Date })
  createdAt: Date;

  @ApiProperty({ type: Date })
  updatedAt: Date;

  static fromEntity(bundle: ServiceBundleView): ServiceBundleResponseDto {
    const dto = new ServiceBundleResponseDto();
    dto.id = bundle.id;
    dto.businessId = bundle.businessId;
    dto.categoryId = bundle.categoryId;
    dto.image = bundle.imageFile ? FileResponseDto.fromEntity(bundle.imageFile) : null;
    dto.title = bundle.title;
    dto.description = bundle.description;
    dto.executionMode = bundle.executionMode as BookingExecutionMode;
    dto.pricingMode = bundle.pricingMode as BundlePricingMode;
    dto.fixedPrice = bundle.fixedPrice == null ? null : MoneyService.format(bundle.fixedPrice);
    dto.price = MoneyService.format(bundle.fixedPrice ?? bundle.items.reduce(
      (sum, item) => sum.plus(item.service.price),
      MoneyService.decimal(0),
    ));
    dto.durationMinutes = bundle.executionMode === BookingExecutionMode.PARALLEL
      ? Math.max(...bundle.items.map((item) => item.service.durationMinutes + item.service.bufferMinutes), 0)
      : bundle.items.reduce((sum, item) => sum + item.service.durationMinutes + item.service.bufferMinutes, 0);
    dto.status = bundle.status;
    dto.sortOrder = bundle.sortOrder;
    dto.items = bundle.items.map((item) => ({
      id: item.id,
      serviceId: item.serviceId,
      serviceTitle: item.service.title,
      sortOrder: item.sortOrder,
    }));
    dto.createdAt = bundle.createdAt;
    dto.updatedAt = bundle.updatedAt;
    return dto;
  }
}
