import { ForbiddenException, Injectable } from '@nestjs/common';
import { Permission } from '../../access/enums/permission.enum.js';
import {
  assertPermission,
  hasPermission,
} from '../../access/utils/assert-permission.js';
import { TokenPayloadDto } from '../../auth/dto/token-payload.dto.js';
import { StaffService } from './staff.service.js';

@Injectable()
export class StaffAccessService {
  constructor(private readonly staff: StaffService) {}

  async resolveStaffId(
    token: TokenPayloadDto,
    locationId: string,
    fullPermission: Permission,
    ownPermission: Permission,
  ): Promise<string | undefined> {
    if (hasPermission(token, fullPermission, locationId)) return undefined;
    assertPermission(token, ownPermission, locationId);
    return (await this.staff.resolveOwnProfile(locationId, token.sub)).id;
  }

  async assertStaff(
    token: TokenPayloadDto,
    locationId: string,
    staffId: string,
    fullPermission: Permission,
    ownPermission: Permission,
  ): Promise<void> {
    const ownId = await this.resolveStaffId(
      token,
      locationId,
      fullPermission,
      ownPermission,
    );
    if (ownId && ownId !== staffId)
      throw new ForbiddenException('Access denied');
  }
}
