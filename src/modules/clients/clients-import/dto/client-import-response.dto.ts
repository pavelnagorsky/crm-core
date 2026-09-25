import { ApiProperty } from '@nestjs/swagger';

export class ClientImportResponseDto {
  @ApiProperty({ type: Number })
  successCount: number;

  @ApiProperty({ type: Number })
  duplicateCount: number;

  @ApiProperty({ type: Number })
  errorCount: number;

  constructor(successCount: number, duplicateCount: number, errorCount: number) {
    this.successCount = successCount;
    this.duplicateCount = duplicateCount;
    this.errorCount = errorCount;
  }
}
