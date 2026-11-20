import { ApiProperty } from '@nestjs/swagger';
import { EmailTemplate } from '../enums/email-template.enum.js';

export class EmailTemplateStatDto {
  @ApiProperty({ enum: EmailTemplate, enumName: 'EmailTemplate' })
  template: EmailTemplate;

  @ApiProperty({ type: Number })
  total: number;

  @ApiProperty({ type: Number })
  sent: number;

  @ApiProperty({ type: Number })
  failed: number;
}
