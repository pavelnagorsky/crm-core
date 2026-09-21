import { ApiProperty } from '@nestjs/swagger';
import { StaffKpiCardDto } from './staff-kpi-card.dto.js';

export class StaffWidgetsResponseDto {
  @ApiProperty({ type: () => StaffKpiCardDto, isArray: true })
  cards: StaffKpiCardDto[];

  constructor(cards: StaffKpiCardDto[]) {
    this.cards = cards;
  }
}
