import { Injectable, PipeTransform } from '@nestjs/common';
import { User } from '@prisma/client';
import { TokenPayloadDto } from '../dto/token-payload.dto.js';
import { UserService } from '../../user/user.service.js';

@Injectable()
export class UserFromTokenPipe implements PipeTransform<TokenPayloadDto, Promise<User>> {
  constructor(private readonly userService: UserService) {}

  transform(payload: TokenPayloadDto): Promise<User> {
    return this.userService.findById(payload.sub);
  }
}
