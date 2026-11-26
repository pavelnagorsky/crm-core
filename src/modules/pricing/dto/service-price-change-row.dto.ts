import { ApiProperty } from '@nestjs/swagger';
import { PriceChangeTarget } from '@prisma/client';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { PriceChangeRow } from '../interfaces/price-change-row.interface.js';
import { minorToApi } from '../rules/pricing-money.rules.js';

/** One price of a preview: what it is now and what it becomes. */
export class ServicePriceChangeRowDto {
  @ApiProperty({
    type: String,
    example: 'LEVEL:<serviceId>:<levelId>',
    description:
      'BASE:<serviceId> | LEVEL:<serviceId>:<levelId> | STAFF:<serviceId>:<staffId> | BUNDLE:<bundleId>',
  })
  key: string;

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

  @ApiPrice({
    required: true,
    nullable: true,
    description:
      'Price in effect on the date; null: there was no level or personal price.',
  })
  before: string | null;

  @ApiPrice({
    required: true,
    nullable: true,
    description: 'New price; null: remove the level or personal price.',
  })
  after: string | null;

  @ApiProperty({
    type: Boolean,
    description: 'The new price cannot be applied.',
  })
  invalid: boolean;

  @ApiProperty({
    type: Boolean,
    description: 'Valid and changes the price: checked by default.',
  })
  checked: boolean;

  static fromRow(row: PriceChangeRow): ServicePriceChangeRowDto {
    const dto = new ServicePriceChangeRowDto();
    dto.key = row.key;
    dto.targetType = row.targetType;
    dto.levelId = row.levelId;
    dto.levelName = row.levelName;
    dto.staffId = row.staffId;
    dto.staffName = row.staffName;
    dto.before = row.before === null ? null : minorToApi(row.before);
    dto.after = row.after === null ? null : minorToApi(row.after);
    dto.invalid = row.invalid;
    dto.checked = row.checked;
    return dto;
  }
}
