import { ApiProperty } from '@nestjs/swagger';

export class WidgetTableRowDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Id of the parent row for a nested row; null for a top row. Nested rows follow their parent',
  })
  parentId: string | null;

  @ApiProperty({ type: String })
  label: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'number', nullable: true },
    description:
      'Value per column key; null where the value is not known for this row',
  })
  values: Record<string, number | null>;
}
