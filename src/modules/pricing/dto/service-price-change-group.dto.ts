import { ApiProperty } from '@nestjs/swagger';
import { ServiceStatus } from '@prisma/client';
import { ServicePriceChangeGroupKind } from '../enums/service-price-change-group-kind.enum.js';
import { PriceChangeGroup } from '../interfaces/price-change-group.interface.js';
import { ServicePriceChangeRowDto } from './service-price-change-row.dto.js';

/** The preview rows of one service or bundle. */
export class ServicePriceChangeGroupDto {
  @ApiProperty({
    enum: ServicePriceChangeGroupKind,
    enumName: 'ServicePriceChangeGroupKind',
  })
  kind: ServicePriceChangeGroupKind;

  @ApiProperty({ type: String, format: 'uuid' })
  id: string;

  @ApiProperty({ type: String })
  title: string;

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  categoryId: string | null;

  @ApiProperty({ type: String, nullable: true })
  categoryName: string | null;

  @ApiProperty({ enum: ServiceStatus, enumName: 'ServiceStatus' })
  status: ServiceStatus;

  @ApiProperty({ type: () => ServicePriceChangeRowDto, isArray: true })
  rows: ServicePriceChangeRowDto[];

  static fromGroup(group: PriceChangeGroup): ServicePriceChangeGroupDto {
    const dto = new ServicePriceChangeGroupDto();
    dto.kind = group.kind;
    dto.id = group.id;
    dto.title = group.title;
    dto.categoryId = group.categoryId;
    dto.categoryName = group.categoryName;
    dto.status = group.status;
    dto.rows = group.rows.map(ServicePriceChangeRowDto.fromRow);
    return dto;
  }
}
