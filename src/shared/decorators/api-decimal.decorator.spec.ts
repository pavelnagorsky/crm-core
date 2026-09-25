import 'reflect-metadata';
import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  ApiOkResponse,
  ApiProperty,
  DocumentBuilder,
  SwaggerModule,
} from '@nestjs/swagger';
import { IsSignedAmount } from './is-signed-amount.decorator.js';
import {
  ApiDecimal,
  ApiPercent,
  ApiPrice,
  ApiSignedAmount,
  registerDecimalSchemas,
} from './api-decimal.decorator.js';

class MoneySampleDto {
  @ApiPrice()
  price: string;

  @ApiPrice({ nullable: true })
  customPrice: string | null;

  @ApiPrice({ required: false, nullable: true })
  draftPrice?: string;

  @ApiSignedAmount()
  amount: string;

  @ApiPercent()
  commissionPercent: string;

  @ApiDecimal({ nullable: true })
  quantity: string | null;

  @ApiProperty({
    example: '1500.00',
    description: 'Bonus must be positive.',
  })
  @IsSignedAmount()
  manualAmount: string;
}

@Controller('money')
class MoneySampleController {
  @Get()
  @ApiOkResponse({ type: MoneySampleDto })
  get(): MoneySampleDto {
    return {
      price: '49.99',
      customPrice: null,
      amount: '-150.00',
      commissionPercent: '30.00',
      quantity: null,
      manualAmount: '1500.00',
    };
  }
}

@Module({ controllers: [MoneySampleController] })
class MoneySampleModule {}

describe('decimal swagger schemas', () => {
  it('documents monetary strings as named decimal schemas', async () => {
    const app = await NestFactory.create(MoneySampleModule, { logger: false });
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    registerDecimalSchemas(document);
    await app.close();

    expect(document.components?.schemas?.Price).toMatchObject({
      type: 'string',
      format: 'decimal',
      example: '49.99',
    });
    expect(document.components?.schemas?.SignedAmount).toMatchObject({
      example: '-150.00',
    });
    expect(document.components?.schemas?.Percent).toMatchObject({
      example: '30.00',
    });

    const moneySample = document.components?.schemas?.MoneySampleDto;
    const properties = moneySample?.properties as Record<
      string,
      { allOf?: { $ref: string }[]; nullable?: boolean; type?: string }
    >;
    expect(properties.price).toMatchObject({
      allOf: [{ $ref: '#/components/schemas/Price' }],
    });
    expect(properties.price.type).toBeUndefined();
    expect(properties.customPrice).toMatchObject({
      nullable: true,
      allOf: [{ $ref: '#/components/schemas/Price' }],
    });
    expect(properties.amount.allOf).toEqual([
      { $ref: '#/components/schemas/SignedAmount' },
    ]);
    expect(properties.commissionPercent.allOf).toEqual([
      { $ref: '#/components/schemas/Percent' },
    ]);
    expect(properties.quantity).toMatchObject({
      nullable: true,
      allOf: [{ $ref: '#/components/schemas/Decimal' }],
    });
    expect(properties.manualAmount).toMatchObject({
      example: '1500.00',
      description: 'Bonus must be positive.',
      allOf: [{ $ref: '#/components/schemas/SignedAmount' }],
    });
    expect(properties.manualAmount.type).toBeUndefined();
    expect(moneySample?.required).toEqual(
      expect.arrayContaining([
        'price',
        'customPrice',
        'amount',
        'commissionPercent',
        'quantity',
        'manualAmount',
      ]),
    );
    expect(moneySample?.required).not.toContain('draftPrice');
  });
});
