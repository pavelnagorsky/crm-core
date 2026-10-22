import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiResponse } from '../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../shared/dto/base-response.dto.js';
import { Auth } from '../../auth/decorators/auth.decorator.js';
import { BookingPaletteCatalogDto } from '../dto/booking-palette-catalog.dto.js';

@ApiTags('Booking channels')
@Controller('booking-channels')
export class BookingPalettesController {
  @Auth()
  @Get('palettes')
  @ApiOperation({ summary: 'Get the shared booking form palette catalog' })
  @ApiOkResponse({ type: ApiResponse(BookingPaletteCatalogDto) })
  async palettes(): Promise<BaseResponseDto<BookingPaletteCatalogDto>> {
    return BaseResponseDto.success(BookingPaletteCatalogDto.create());
  }
}
