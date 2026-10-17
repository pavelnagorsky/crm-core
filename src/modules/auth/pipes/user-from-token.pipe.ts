import { Injectable, PipeTransform } from '@nestjs/common';
import { User } from '@prisma/client';
import { UserService } from '../../user/services/user.service.js';
import { TokenPayloadDto } from '../dto/token-payload.dto.js';

@Injectable()
export class UserFromTokenPipe implements PipeTransform<
  TokenPayloadDto,
  Promise<User>
> {
  constructor(private readonly userService: UserService) {}

  transform(payload: TokenPayloadDto): Promise<User> {
    return this.userService.findById(payload.sub);
  }
}
