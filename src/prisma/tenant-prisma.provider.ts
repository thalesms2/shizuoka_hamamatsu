import { InternalServerErrorException, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { PrismaService } from './prisma.service.js';
import { createTenantClient, type TenantClient } from './tenant-client.js';

export const TENANT_PRISMA = Symbol('TENANT_PRISMA');

export const tenantPrismaFactory = (
  request: { user?: AuthenticatedUser },
  prisma: PrismaService,
): TenantClient => {
  const tenantId = request.user?.tenantId;

  if (!tenantId) {
    throw new InternalServerErrorException(
      'TENANT_PRISMA was injected into a route with no authenticated tenant',
    );
  }

  return createTenantClient(prisma, tenantId);
};

export const tenantPrismaProvider = {
  provide: TENANT_PRISMA,
  scope: Scope.REQUEST,
  inject: [REQUEST, PrismaService],
  useFactory: tenantPrismaFactory,
};
