import { ApiProperty } from '@nestjs/swagger';

/** A frequent attempt error in the period; the text is cut to 300 characters to group repeats. */
export class EmailErrorStatDto {
  @ApiProperty()
  error: string;

  @ApiProperty({ type: Number, nullable: true })
  errorCode: number | null;

  @ApiProperty({ type: Number, description: 'Failed attempts with this error' })
  count: number;

  @ApiProperty({ type: String, format: 'date-time' })
  lastAt: Date;
}
