import { IsOptionalProductPurpose } from '../../../products/decorators/is-optional-product-purpose.decorator.js';
import { ProductPurpose } from '../../../products/enums/product-purpose.enum.js';

export class InventoryStatementExportRequestDto {
  @IsOptionalProductPurpose()
  purpose?: ProductPurpose;
}
