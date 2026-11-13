import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiResponse } from '../../../shared/dto/api-response.dto.js';
import { SkipRateLimit } from '../../../shared/decorators/skip-rate-limit.decorator.js';
import { BaseResponseDto } from '../../../shared/dto/base-response.dto.js';
import { HealthResponseDto } from '../dto/health-response.dto.js';

@ApiTags('Health')
@Controller('health')
@SkipRateLimit()
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
