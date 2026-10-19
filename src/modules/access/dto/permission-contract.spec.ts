import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Claim } from '../enums/claim.enum.js';
import { PermissionAccess } from '../enums/permission-access.enum.js';
import { PermissionEffect } from '../enums/permission-effect.enum.js';
import { AccessPolicyEntryDto } from './access-policy-entry.dto.js';
import { PermissionChangeDto } from './permission-change.dto.js';
import { UserAccessResponseDto } from './user-access-response.dto.js';

describe('Claim access API contract', () => {
  it('validates individual policy actions and rejects the old request format', async () => {
    const change = {
      role: 'MANAGER',
      claim: Claim.INVENTORY,
      access: PermissionAccess.READ,
      effect: PermissionEffect.DENY,
    };
    expect(
      await validate(plainToInstance(PermissionChangeDto, change)),
    ).toEqual([]);
    for (const invalid of [
      { ...change, access: PermissionAccess.READ_WRITE },
      { ...change, claim: 'inventory.read' },
      { ...change, effect: 'invalid' },
      { role: 'MANAGER', permission: 'inventory.read', value: 'DENY' },
    ]) {
      expect(
        (await validate(plainToInstance(PermissionChangeDto, invalid))).length,
      ).toBeGreaterThan(0);
    }
  });

  it('documents explicit policy pairs, structured dependencies, and scoped grant maps', async () => {
    const module = await Test.createTestingModule({}).compile();
    const app = module.createNestApplication();
    try {
      const document = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().build(),
        {
          extraModels: [
            PermissionChangeDto,
            AccessPolicyEntryDto,
            UserAccessResponseDto,
          ],
        },
      );
      const schemas = document.components!.schemas!;
      expect(schemas.PermissionChangeDto).toMatchObject({
        required: expect.arrayContaining(['role', 'claim', 'access', 'effect']),
        properties: {
          access: { enum: ['read', 'write'] },
          effect: { enum: ['ALLOW', 'DENY', 'INHERIT'] },
        },
      });
      expect(schemas.AccessPolicyEntryDto).toMatchObject({
        properties: {
          access: { enum: ['read', 'write'] },
          dependencies: {
            type: 'array',
            items: { $ref: '#/components/schemas/PermissionDto' },
          },
        },
      });
      expect(schemas.UserAccessResponseDto).toMatchObject({
        properties: {
          permissions: {
            type: 'object',
            additionalProperties: {
              type: 'object',
              additionalProperties: {
                type: 'string',
                enum: ['read', 'write', 'readWrite'],
              },
            },
          },
        },
      });
      expect(schemas.AccessScopeResponseDto).toMatchObject({
        properties: {
          permissions: {
            type: 'object',
            additionalProperties: {
              type: 'string',
              enum: ['read', 'write', 'readWrite'],
            },
          },
          sharedPermissions: { type: 'object' },
        },
      });
    } finally {
      await app.close();
    }
  });
});
