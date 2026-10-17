import { NestFactory } from '@nestjs/core';
import {
  DocumentBuilder,
  SwaggerModule,
  type SchemaObject,
} from '@nestjs/swagger';
import 'reflect-metadata';
import { MoneySampleModule } from '../../../test/fixtures/decimal/money-sample.module.js';
import { registerDecimalSchemas } from './api-decimal.decorator.js';

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

    const moneySample = document.components?.schemas?.MoneySampleDto as
      SchemaObject | undefined;
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
