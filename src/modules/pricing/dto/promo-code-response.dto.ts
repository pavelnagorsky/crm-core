import { ApiProperty } from '@nestjs/swagger';

export class PromoCodeResponseDto {
  @ApiProperty({
    type: String,
    example: 'K7M2QX9P',
    description: '8 characters without 0, O, 1, I; free in the location now.',
  })
  code: string;
}
