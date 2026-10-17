import { Module } from '@nestjs/common';
import 'reflect-metadata';
import { MoneySampleController } from './controllers/money-sample.controller.js';

@Module({ controllers: [MoneySampleController] })
export class MoneySampleModule {}
