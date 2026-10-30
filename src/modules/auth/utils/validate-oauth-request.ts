import { BadRequestException } from '@nestjs/common';
import { ClassConstructor, plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Request } from 'express';
import { exceptionFactory } from '../../../shared/validation/exception-factory.js';

export async function validateOAuthRequest<T extends object>(
  req: Request<Record<string, string>, unknown, unknown>,
  dtoClass: ClassConstructor<T>,
): Promise<T> {
  if (!req.is('application/json')) {
    throw new BadRequestException('OAuth sign-in requires a JSON request body');
  }
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    throw new BadRequestException();
  }
  const dto = plainToInstance(dtoClass, req.body);
  const errors = await validate(dto, { whitelist: true });
  if (errors.length) throw exceptionFactory(errors);
  return dto;
}
