import { ApiProperty } from '@nestjs/swagger';
import { ServicePriceChangeDetailView } from '../interfaces/service-price-change-detail-view.interface.js';
import { ServicePriceChangeDetailGroupDto } from './service-price-change-detail-group.dto.js';
import { ServicePriceChangeSummaryDto } from './service-price-change-summary.dto.js';

export class ServicePriceChangeDetailDto extends ServicePriceChangeSummaryDto {
  @ApiProperty({ type: () => ServicePriceChangeDetailGroupDto, isArray: true })
  groups: ServicePriceChangeDetailGroupDto[];

  static fromDetail(
    view: ServicePriceChangeDetailView,
  ): ServicePriceChangeDetailDto {
    const dto = Object.assign(
      new ServicePriceChangeDetailDto(),
      ServicePriceChangeSummaryDto.fromView(view),
    );
    dto.groups = view.groups.map(ServicePriceChangeDetailGroupDto.fromGroup);
    return dto;
  }
}
