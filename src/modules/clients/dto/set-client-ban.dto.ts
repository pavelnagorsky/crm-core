import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator';

export class SetClientBanDto {
  @ApiProperty({ type: Boolean })
  @IsBoolean()
  banned: boolean;

  @ApiProperty({
    type: String,
    maxLength: 500,
    required: false,
    description: 'Required when banned is true',
  })
  @ValidateIf((dto: SetClientBanDto) => dto.banned === true)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason?: string;
}
