import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiResponse,
  BaseResponseDto,
} from '../../shared/dto/base-response.dto.js';
import { HealthResponseDto } from './dto/health-response.dto.js';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiOkResponse({ type: ApiResponse(HealthResponseDto) })
  @Get()
  check(): BaseResponseDto<HealthResponseDto> {
    return BaseResponseDto.success({
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  }
}
