import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import 'reflect-metadata';
import { MoneySampleDto } from '../dto/money-sample.dto.js';

@Controller('money')
export class MoneySampleController {
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
