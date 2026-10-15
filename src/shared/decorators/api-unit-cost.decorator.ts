import { ApiProperty } from '@nestjs/swagger';

export const ApiUnitCost = (nullable = false): PropertyDecorator =>
  ApiProperty({
    type: String,
    format: 'decimal',
    nullable,
    example: '3.33333333',
    description: 'Calculated cost per base unit, with 8 fractional digits.',
  });
