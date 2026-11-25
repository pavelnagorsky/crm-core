import { ApiProperty } from '@nestjs/swagger';
import { ServicePriceChangeRollbackView } from '../interfaces/service-price-change-rollback-view.interface.js';
import { ServicePriceChangeDetailDto } from './service-price-change-detail.dto.js';
import { ServicePriceChangeItemRowDto } from './service-price-change-item-row.dto.js';

export class ServicePriceChangeRollbackResponseDto {
  @ApiProperty({ type: () => ServicePriceChangeDetailDto })
  change: ServicePriceChangeDetailDto;

  @ApiProperty({ type: Number })
  restoredCount: number;

  @ApiProperty({
    type: () => ServicePriceChangeItemRowDto,
    isArray: true,
    description: 'Rows not returned, with the current price: it changed after.',
  })
  skipped: ServicePriceChangeItemRowDto[];

  static fromView(
    view: ServicePriceChangeRollbackView,
  ): ServicePriceChangeRollbackResponseDto {
    const dto = new ServicePriceChangeRollbackResponseDto();
    dto.change = ServicePriceChangeDetailDto.fromDetail(view.detail);
    dto.restoredCount = view.restoredCount;
    dto.skipped = view.skipped.map(ServicePriceChangeItemRowDto.fromRow);
    return dto;
  }
}
