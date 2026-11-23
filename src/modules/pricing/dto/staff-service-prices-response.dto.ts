import { ApiProperty } from '@nestjs/swagger';
import { StaffServicePricesView } from '../interfaces/staff-service-prices-view.interface.js';
import { StaffServicePriceResponseDto } from './staff-service-price-response.dto.js';

export class StaffServicePricesResponseDto {
  @ApiProperty({ type: String })
  staffId: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Null: the default level.',
  })
  levelId: string | null;

  @ApiProperty({ type: () => StaffServicePriceResponseDto, isArray: true })
  items: StaffServicePriceResponseDto[];

  static fromView(view: StaffServicePricesView): StaffServicePricesResponseDto {
    const dto = new StaffServicePricesResponseDto();
    dto.staffId = view.staffId;
    dto.levelId = view.levelId;
    dto.items = view.items.map(StaffServicePriceResponseDto.fromView);
    return dto;
  }
}
