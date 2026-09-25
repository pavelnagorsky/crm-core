import { ApiProperty } from '@nestjs/swagger';

export class ClientImportRowErrorDto {
  @ApiProperty({ type: Number, description: 'Excel row number, header is row 1' })
  row: number;

  @ApiProperty({ type: String })
  code: string;

  @ApiProperty({ type: String })
  message: string;
}

export class ClientImportResponseDto {
  @ApiProperty({ type: Number })
  successCount: number;

  @ApiProperty({ type: Number })
  errorCount: number;

  @ApiProperty({ type: ClientImportRowErrorDto, isArray: true })
  errors: ClientImportRowErrorDto[];
}
