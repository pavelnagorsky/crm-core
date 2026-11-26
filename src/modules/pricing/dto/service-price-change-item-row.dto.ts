import { ApiProperty } from '@nestjs/swagger';
import {
  PriceChangeSkip,
  PriceChangeTarget,
} from '@prisma/client';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { PriceChangeItemRow } from '../interfaces/price-change-item-row.interface.js';
import { minorToApi } from '../rules/pricing-money.rules.js';

/** One stored row of a change (the contract's detail ServicePriceChangeRowDto). */
export class ServicePriceChangeItemRowDto {
  @ApiProperty({ type: String, format: 'uuid' })
  itemId: string;

  @ApiProperty({
    enum: PriceChangeTarget,
    enumName: 'PriceChangeTarget',
  })
  targetType: PriceChangeTarget;

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  levelId: string | null;

  @ApiProperty({ type: String, nullable: true })
  levelName: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  staffId: string | null;

  @ApiProperty({ type: String, nullable: true })
  staffName: string | null;

  @ApiPrice({ required: true, nullable: true })
  before: string | null;

  @ApiPrice({ required: true, nullable: true })
  after: string | null;

  @ApiPrice({
    required: false,
    nullable: true,
    description: 'Stored price now; only in the rollback answer.',
  })
  current?: string | null;

  @ApiProperty({
    enum: PriceChangeSkip,
    enumName: 'PriceChangeSkip',
    nullable: true,
    description: 'Why the row was not written on apply.',
  })
  applySkip: PriceChangeSkip | null;

  @ApiProperty({
    enum: PriceChangeSkip,
    enumName: 'PriceChangeSkip',
    nullable: true,
    description: 'Why the row was not returned on rollback.',
  })
  rollbackSkip: PriceChangeSkip | null;

  @ApiProperty({ type: Boolean })
  rolledBack: boolean;

  static fromRow(row: PriceChangeItemRow): ServicePriceChangeItemRowDto {
    const dto = new ServicePriceChangeItemRowDto();
    dto.itemId = row.itemId;
    dto.targetType = row.targetType;
    dto.levelId = row.levelId;
    dto.levelName = row.levelName;
    dto.staffId = row.staffId;
    dto.staffName = row.staffName;
    dto.before = row.before === null ? null : minorToApi(row.before);
    dto.after = row.after === null ? null : minorToApi(row.after);
    if (row.current !== undefined)
      dto.current = row.current === null ? null : minorToApi(row.current);
    dto.applySkip = row.applySkip;
    dto.rollbackSkip = row.rollbackSkip;
    dto.rolledBack = row.rolledBack;
    return dto;
  }
}
