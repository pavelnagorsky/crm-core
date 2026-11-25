import { ApiProperty } from '@nestjs/swagger';
import { ServicePriceChangeGroupKind } from '../enums/service-price-change-group-kind.enum.js';
import { PriceChangeDetailGroup } from '../interfaces/price-change-detail-group.interface.js';
import { ServicePriceChangeItemRowDto } from './service-price-change-item-row.dto.js';

export class ServicePriceChangeDetailGroupDto {
  @ApiProperty({
    enum: ServicePriceChangeGroupKind,
    enumName: 'ServicePriceChangeGroupKind',
  })
  kind: ServicePriceChangeGroupKind;

  @ApiProperty({
    type: String,
    nullable: true,
    format: 'uuid',
    description: 'Null: the target was deleted.',
  })
  id: string | null;

  @ApiProperty({ type: String })
  title: string;

  @ApiProperty({ type: String, nullable: true })
  categoryName: string | null;

  @ApiProperty({ type: () => ServicePriceChangeItemRowDto, isArray: true })
  rows: ServicePriceChangeItemRowDto[];

  static fromGroup(
    group: PriceChangeDetailGroup,
  ): ServicePriceChangeDetailGroupDto {
    const dto = new ServicePriceChangeDetailGroupDto();
    dto.kind = group.kind;
    dto.id = group.id;
    dto.title = group.title;
    dto.categoryName = group.categoryName;
    dto.rows = group.rows.map(ServicePriceChangeItemRowDto.fromRow);
    return dto;
  }
}
