import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { UserService } from './user.service.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UserResponseDto } from './dto/user-response.dto.js';
import { Auth } from '../auth/decorators/auth.decorator.js';
import { TokenPayload } from '../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../auth/dto/token-payload.dto.js';
import { ApiResponse, BaseResponseDto } from '../../shared/dto/base-response.dto.js';
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
  async me(@TokenPayload() payload: TokenPayloadDto): Promise<BaseResponseDto<UserResponseDto>> {
    const user = await this.userService.findById(payload.sub);
    return BaseResponseDto.success(UserResponseDto.fromEntity(user, payload));
  }

  @ApiOperation({ summary: 'Update current user profile' })
  @ApiOkResponse({ type: ApiResponse(UserResponseDto) })
  @ApiUnauthorizedResponse({ type: UnauthorizedResponseDto })
  @Auth()
  @Put('me')
  async updateMe(
    @TokenPayload() payload: TokenPayloadDto,
    @Body() dto: UpdateUserDto,
  ): Promise<BaseResponseDto<UserResponseDto>> {
    const user = await this.userService.update(payload.sub, dto);
    return BaseResponseDto.success(UserResponseDto.fromEntity(user, payload));
  }
}
