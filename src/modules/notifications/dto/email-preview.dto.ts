import { ApiProperty } from '@nestjs/swagger';

export class EmailPreviewDto {
  @ApiProperty()
  subject: string;

  @ApiProperty({
    description:
      'Full HTML document rendered now from the stored data; show it in a sandboxed iframe',
  })
  html: string;
}
