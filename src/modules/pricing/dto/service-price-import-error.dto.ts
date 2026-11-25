import { ApiProperty } from '@nestjs/swagger';
import { ServicePriceImportRowError } from '../enums/service-price-import-row-error.enum.js';
import { ServicePriceImportSheet } from '../enums/service-price-import-sheet.enum.js';
import { ServicePriceImportErrorEntry } from '../interfaces/service-price-import-error-entry.interface.js';

export class ServicePriceImportErrorDto {
  @ApiProperty({
    enum: ServicePriceImportSheet,
    enumName: 'ServicePriceImportSheet',
  })
  sheet: ServicePriceImportSheet;

  @ApiProperty({ type: Number, description: 'Row number as in Excel.' })
  row: number;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'The header of the column in the file.',
  })
  column: string | null;

  @ApiProperty({
    enum: ServicePriceImportRowError,
    enumName: 'ServicePriceImportRowError',
  })
  code: ServicePriceImportRowError;

  static fromEntry(
    entry: ServicePriceImportErrorEntry,
  ): ServicePriceImportErrorDto {
    const dto = new ServicePriceImportErrorDto();
    dto.sheet = entry.sheet;
    dto.row = entry.row;
    dto.column = entry.column;
    dto.code = entry.code;
    return dto;
  }
}
