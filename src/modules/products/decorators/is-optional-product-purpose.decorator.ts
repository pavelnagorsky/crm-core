import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { ProductPurpose } from '../enums/product-purpose.enum.js';

export const IsOptionalProductPurpose =
  (): PropertyDecorator => (target, propertyKey) => {
    ApiProperty({
      enum: ProductPurpose,
      enumName: 'ProductPurpose',
      required: false,
      description:
        'SALE: products for sale. INTERNAL: products for internal use. Products with both purposes match both. Omit for all products.',
    })(target, propertyKey);
    IsOptional()(target, propertyKey);
    IsEnum(ProductPurpose)(target, propertyKey);
  };
