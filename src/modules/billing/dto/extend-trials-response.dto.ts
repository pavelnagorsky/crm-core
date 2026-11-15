import { ApiProperty } from '@nestjs/swagger';

export class ExtendTrialsResponseDto {
  @ApiProperty({
    description: 'Brands changed, or that would change with dryRun',
  })
  count: number;

  @ApiProperty()
  dryRun: boolean;

  static of(count: number, dryRun: boolean): ExtendTrialsResponseDto {
    return Object.assign(new ExtendTrialsResponseDto(), { count, dryRun });
  }
}
