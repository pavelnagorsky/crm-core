import { PartialType } from '@nestjs/swagger';
import { CreateServiceBundleDto } from './create-service-bundle.dto.js';

export class UpdateServiceBundleDto extends PartialType(CreateServiceBundleDto) {}
