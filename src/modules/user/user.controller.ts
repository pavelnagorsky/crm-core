import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { UserService } from './user.service.js';
import { UserResponseDto } from './dto/user-response.dto.js';
import { Auth } from '../auth/decorators/auth.decorator.js';
import { TokenPayload } from '../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../auth/dto/token-payload.dto.js';
import { ApiResponse } from '../../shared/dto/base-response.dto.js';
import { UnauthorizedResponseDto } from '../../shared/validation/validation-exception.dto.js';

@ApiTags('Users')
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @ApiOperation({ summary: 'Get current user profile' })
  @ApiOkResponse({ type: ApiResponse(UserResponseDto) })
  @ApiUnauthorizedResponse({ type: UnauthorizedResponseDto })
  @Auth()
  @Get('me')
  async me(@TokenPayload() payload: TokenPayloadDto): Promise<UserResponseDto> {
    const user = await this.userService.findById(payload.sub);
    return UserResponseDto.fromEntity(user);
  }
}
