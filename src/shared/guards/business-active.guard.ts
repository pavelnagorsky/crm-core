import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { Request } from 'express';
import { BrandService } from '../../modules/brand/services/brand.service.js';
import { LocationService } from '../../modules/location/services/location.service.js';

@Injectable()
export class BusinessActiveGuard implements CanActivate {
  constructor(
    private readonly brands: BrandService,
    private readonly locations: LocationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const { brandId, locationId } = request.params;
    if (brandId) {
      if (typeof brandId !== 'string' || !isUUID(brandId)) {
        throw new BadRequestException('Invalid brand ID');
      }
      await this.brands.findById(brandId);
    }
    if (locationId) {
      if (typeof locationId !== 'string' || !isUUID(locationId)) {
        throw new BadRequestException('Invalid location ID');
      }
      await this.locations.findById(locationId);
    }
    return true;
  }
}
