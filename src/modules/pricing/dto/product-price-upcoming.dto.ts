import { ApiProperty } from '@nestjs/swagger';
import { ProductPriceUpcomingView } from '../interfaces/product-price-upcoming-view.interface.js';
import { minorToApi } from '../rules/pricing-money.rules.js';
import { ProductPriceUpcomingNextDto } from './product-price-upcoming-next.dto.js';
import { ProductPriceUpcomingProductDto } from './product-price-upcoming-product.dto.js';

export class ProductPriceUpcomingDto {
  @ApiProperty({ type: () => ProductPriceUpcomingNextDto, nullable: true })
  next: ProductPriceUpcomingNextDto | null;

  @ApiProperty({ type: () => ProductPriceUpcomingProductDto, isArray: true })
  products: ProductPriceUpcomingProductDto[];

  static fromView(view: ProductPriceUpcomingView): ProductPriceUpcomingDto {
    return Object.assign(new ProductPriceUpcomingDto(), {
      next: view.next
        ? Object.assign(new ProductPriceUpcomingNextDto(), view.next)
        : null,
      products: view.products.map((item) =>
        Object.assign(new ProductPriceUpcomingProductDto(), {
          productId: item.productId,
          effectiveDate: item.effectiveDate,
          price: minorToApi(item.price),
          changeId: item.changeId,
        }),
      ),
    });
  }
}
