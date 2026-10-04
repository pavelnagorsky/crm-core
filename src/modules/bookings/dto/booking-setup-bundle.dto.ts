import { ApiProperty } from '@nestjs/swagger';
import { File, Service, ServiceBundle, ServiceBundleItem } from '@prisma/client';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { FileResponseDto } from '../../../shared/dto/file-response.dto.js';
import { MoneyService } from '../../../shared/money/money.service.js';
import { BookingExecutionMode } from '../enums/booking-execution-mode.enum.js';

export class BookingSetupBundleDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  title: string;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty({ type: () => FileResponseDto, nullable: true })
  image: FileResponseDto | null;

  @ApiPrice()
  price: string;

  @ApiProperty({ type: Number })
  durationMinutes: number;

  @ApiProperty({ enum: BookingExecutionMode, enumName: 'BookingExecutionMode' })
  executionMode: BookingExecutionMode;

  @ApiProperty({ type: String, isArray: true })
  serviceIds: string[];

  static fromEntity(bundle: ServiceBundle & {
    imageFile: File | null;
    items: (ServiceBundleItem & { service: Service })[];
  }): BookingSetupBundleDto {
    const dto = new BookingSetupBundleDto();
    dto.id = bundle.id;
    dto.title = bundle.title;
    dto.description = bundle.description;
    dto.image = bundle.imageFile ? FileResponseDto.fromEntity(bundle.imageFile) : null;
    dto.price = MoneyService.format(bundle.fixedPrice ?? bundle.items.reduce(
      (sum, item) => sum.plus(item.service.price),
      MoneyService.decimal(0),
    ));
    dto.durationMinutes = bundle.executionMode === BookingExecutionMode.PARALLEL
      ? Math.max(...bundle.items.map((item) => item.service.durationMinutes + item.service.bufferMinutes), 0)
      : bundle.items.reduce((sum, item) => sum + item.service.durationMinutes + item.service.bufferMinutes, 0);
    dto.executionMode = bundle.executionMode as BookingExecutionMode;
    dto.serviceIds = bundle.items.map((item) => item.serviceId);
    return dto;
  }
}
