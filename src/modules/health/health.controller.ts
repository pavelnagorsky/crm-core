import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { ApiResponse, BaseResponseDto } from '../../shared/dto/base-response.dto.js';

class HealthResponseDto {
  @ApiProperty({ type: String, example: 'ok' })
  status: string;

  @ApiProperty({ type: String, example: '2026-09-17T10:00:00.000Z' })
  timestamp: string;
}

@ApiTags('Health')
@Controller('health')
export class HealthController {
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiOkResponse({ type: ApiResponse(HealthResponseDto) })
  @Get()
  check(): BaseResponseDto<HealthResponseDto> {
    return BaseResponseDto.success({ status: 'ok', timestamp: new Date().toISOString() });
  }
}
